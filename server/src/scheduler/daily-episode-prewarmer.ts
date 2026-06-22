import type { RadioEpisode, Track } from "@fakeradio/shared";
import type { LikedSongsRepository } from "../user/liked-songs-repository.js";
import type { StateRepository } from "../state/state-repository.js";
import type { LlmAdapter, MusicAdapter, TtsAdapter, StorySourceAdapter, WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../adapters/types.js";
import type { UserPreferences } from "../user/load-user-preference.js";
import { composeEpisodeFromTrack, buildPersonalHistorySnippet, type ComposeEpisodeDeps } from "../http/episode-runner.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { formatRadioDate } from "../utils/time.js";
import { buildRecommendationContext, selectRecommendedCandidates } from "../recommendation/recommendation-engine.js";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { getAudioFilePath } from "../utils/shared-utils.js";

export type PrewarmDeps = {
  llm: LlmAdapter;
  music: MusicAdapter;
  tts: TtsAdapter;
  ttsCacheDir: string;
  weather: WeatherAdapter;
  calendar: CalendarAdapter;
  devices: DeviceAdapter;
  storySource: StorySourceAdapter;
  publicMetadataAdapter?: StorySourceAdapter | undefined;
  webResearchAdapter?: StorySourceAdapter | undefined;
  likedSongs: LikedSongsRepository;
  stateRepo: StateRepository;
  nowProvider(): Date;
  audioDir: string;
  userPreferences: UserPreferences;
};

async function prefetchTrackAudio(
  audioDir: string,
  track: Track
): Promise<boolean> {
  if (!track.audioUrl) return false;
  const filePath = getAudioFilePath(audioDir, track.id);
  if (existsSync(filePath)) return true;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const response = await fetch(track.audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) return false;
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body as unknown as Readable, fileStream);
    return true;
  } catch (err) {
    console.warn(`[prewarm] Audio prefetch failed for ${track.id}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function generatePrewarmEpisode(
  deps: PrewarmDeps,
  blockAt: string,
  blockLabel: string,
  moodHint: string,
  systemPrompt: string,
  excludedTrackIds: Set<string>
): Promise<{ episode: RadioEpisode; audioDownloaded: boolean } | { error: string }> {
  const { llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource, publicMetadataAdapter, webResearchAdapter, likedSongs, stateRepo, nowProvider } = deps;
  const now = nowProvider();

  const favoritesTracks = await likedSongs.list();

  // Get weather/calendar/devices for context
  const [weatherSnapshot, calendarItems, playbackDevices] = await Promise.all([
    weather.current(),
    calendar.upcoming(),
    devices.list()
  ]);
  const recommendationContext = buildRecommendationContext({
    now,
    block: {
      at: blockAt,
      label: blockLabel,
      moodHint
    },
    weather: weatherSnapshot,
    calendar: calendarItems,
    userPreferences: deps.userPreferences,
    likedSongs: favoritesTracks,
    recentTrackIds: excludedTrackIds,
    queuedTrackIds: new Set()
  });
  const recommendedEntries = await selectRecommendedCandidates({
    music,
    context: recommendationContext,
    limit: 20
  });
  const uniqueCandidates = recommendedEntries.map((entry) => entry.track);

  // Compute DJ decision
  const draftDecision = await computeDjDecision({
    llm,
    now,
    systemPrompt,
    userTaste: deps.userPreferences.taste,
    routines: deps.userPreferences.routines,
    moodRules: deps.userPreferences.moodRules,
    recentMemory: [],
    toolResults: [],
    executionState: "prewarm-episode",
    environment: {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    },
    candidates: uniqueCandidates
  });

  // Select track
  let track: Track | null = null;
  if (draftDecision.play.trackId) {
    const llmPicked = uniqueCandidates.find((t) => t.id === draftDecision.play.trackId && !excludedTrackIds.has(t.id));
    if (llmPicked) {
      try {
        track = await music.resolve(llmPicked);
      } catch { /* fall through */ }
    }
  }

  if (!track) {
    for (const candidate of recommendedEntries) {
      if (excludedTrackIds.has(candidate.track.id)) continue;
      try {
        track = await music.resolve(candidate.track);
        break;
      } catch { /* fall through */ }
    }
  }

  if (!track) {
    return { error: "No track could be resolved" };
  }

  const composeDeps: ComposeEpisodeDeps = {
    llm, tts, ttsCacheDir, storySource,
    publicMetadataAdapter, webResearchAdapter,
    weather, calendar, devices, systemPrompt
  };
  // 与 live 路径对齐：注入 profile + personalHistory，否则预热出的口播质量退化。
  const playedHistory = await stateRepo.getRecentlyPlayed(50);
  const personalHistory = buildPersonalHistorySnippet(track, playedHistory, favoritesTracks);
  const { episode } = await composeEpisodeFromTrack(track, composeDeps, {
    recentMemory: [],
    taste: deps.userPreferences.taste,
    routines: deps.userPreferences.routines,
    moodRules: deps.userPreferences.moodRules,
    profile: deps.userPreferences.profile,
    personalHistory
  });

  return { episode, audioDownloaded: false };
}

export type PrewarmResult = {
  blockAt: string;
  prepared: number;
  failed: number;
  errors: string[];
};

export async function runPrewarmForDate(
  deps: PrewarmDeps,
  targetDate: string,
  blocks: Array<{ at: string; label: string; moodHint: string }>,
  episodesPerBlock: number,
  systemPrompt: string
): Promise<PrewarmResult[]> {
  const { stateRepo, nowProvider } = deps;
  const results: PrewarmResult[] = [];

  const recentPlayed = await stateRepo.getRecentlyPlayed(30);
  const recentlyPlayedTrackIds = new Set(recentPlayed.map((p) => p.trackId));
  const dateSelectedTrackIds = new Set<string>();

  for (const block of blocks) {
    const errors: string[] = [];
    let prepared = 0;
    let failed = 0;

    const blockStatus = await stateRepo.getBlockPrewarmStatus(targetDate, block.at);
    const existingReady = blockStatus.ready;

    const needed = Math.max(0, episodesPerBlock - existingReady);

    for (let i = 0; i < needed; i++) {
      try {
        const excludedTrackIds = new Set<string>([...recentlyPlayedTrackIds, ...dateSelectedTrackIds]);
        const result = await generatePrewarmEpisode(deps, block.at, block.label, block.moodHint, systemPrompt, excludedTrackIds);
        if ("error" in result) {
          await stateRepo.savePreparedEpisode({
            radioDate: targetDate,
            blockAt: block.at,
            status: "failed",
            audioDownloaded: false,
            error: result.error
          });
          errors.push(result.error);
          failed++;
        } else {
          const record = await stateRepo.savePreparedEpisode({
            radioDate: targetDate,
            blockAt: block.at,
            status: "ready",
            episodeJson: JSON.stringify(result.episode),
            audioDownloaded: false
          });
          // Trigger background audio prefetch (don't block the prewarm loop)
          prefetchTrackAudio(deps.audioDir, result.episode.track).then((downloaded) => {
            if (downloaded) {
              stateRepo.markPreparedEpisodeAudioDownloaded(record.id, true).catch(() => {});
            }
          });
          dateSelectedTrackIds.add(result.episode.track.id);
          prepared++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await stateRepo.savePreparedEpisode({
          radioDate: targetDate,
          blockAt: block.at,
          status: "failed",
          audioDownloaded: false,
          error: errorMsg
        });
        errors.push(errorMsg);
        failed++;
      }
    }

    results.push({ blockAt: block.at, prepared, failed, errors });
  }

  return results;
}

export async function shouldRunPrewarm(deps: PrewarmDeps, targetDate: string): Promise<boolean> {
  const lastRun = await deps.stateRepo.getPref<string>(`prewarm:lastRun:${targetDate}`);
  return !lastRun;
}

export async function markPrewarmRunComplete(deps: PrewarmDeps, targetDate: string): Promise<void> {
  await deps.stateRepo.upsertPref(`prewarm:lastRun:${targetDate}`, new Date().toISOString());
  await deps.stateRepo.upsertPref("prewarm:lastRun", new Date().toISOString());
}
