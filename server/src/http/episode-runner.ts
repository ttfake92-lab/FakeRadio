import type { DjDecision, RadioEpisode, Track, TtsResult } from "@fakeradio/shared";
import type { LlmAdapter, MusicAdapter, StorySourceAdapter, TtsAdapter } from "../adapters/types.js";
import { buildContextWindow, type ContextEnvironment } from "../context/context-builder.js";
import { createMockMusicAdapter, createMockTtsAdapter } from "../adapters/index.js";
import type { MemoryRepository } from "../state/memory-repository.js";
import type { PlaybackState } from "./playback-state.js";
import type { UserPreferences } from "../user/load-user-preference.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import type { WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../adapters/types.js";

import type { LikedSongsRepository } from "../user/liked-songs-repository.js";

export type EpisodeRunnerDeps = {
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
  memory: MemoryRepository;
  state: PlaybackState;
  systemPrompt: string;
  userPreferences: UserPreferences;
  musicStatus: string;
  currentMoodHint: string;
  nowProvider: () => Date;
  likedSongs: LikedSongsRepository;
};

export type ResolveResult = {
  track: Track;
  decision: Awaited<ReturnType<typeof computeDjDecision>>;
  isFallback: boolean;
  candidates: Track[];
  candidateSource: "favorites" | "search" | "queue" | "mock";
  rerankSource: "llm-pick" | "fallback";
};

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

function decisionMentionsTrack(decision: DjDecision, track: Track): boolean {
  const haystack = normalizeForMatch([
    decision.say,
    decision.reason,
    decision.play.reason,
    decision.play.query ?? "",
    decision.play.trackId ?? "",
    decision.segue
  ].join("\n"));
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(track.artist);
  return haystack.includes(title) || haystack.includes(artist) || haystack.includes(normalizeForMatch(track.id));
}

function buildGroundedFallbackDecision(
  track: Track,
  candidateSource: ResolveResult["candidateSource"]
): DjDecision {
  const sourceLabel: Record<ResolveResult["candidateSource"], string> = {
    favorites: "你的收藏库",
    search: "网易云搜索结果",
    queue: "当前队列",
    mock: "本地兜底曲库"
  };
  const source = sourceLabel[candidateSource];
  return {
    say: `现在接上 ${track.title}，来自 ${track.artist}。这首歌来自${source}，先让它把当前的节奏稳住。`,
    play: {
      trackId: track.id,
      reason: `${track.title} - ${track.artist} 来自${source}，并已解析为可播放曲目。`
    },
    reason: `已选择 ${track.title} - ${track.artist}，使用确定性文案避免口播偏离所选曲目。`,
    segue: `接上 ${track.title}。`
  };
}

export async function resolveNextTrackAndDecision(deps: EpisodeRunnerDeps): Promise<ResolveResult> {
  const { llm, music, weather, calendar, devices, memory, state, systemPrompt, userPreferences, musicStatus, currentMoodHint, nowProvider, likedSongs } = deps;
  const now = nowProvider();
  const weatherSnapshot = await weather.current();
  const calendarItems = await calendar.upcoming();
  const playbackDevices = await devices.list();
  const recentMemoryEntries = await memory.recent(5);
  const currentTrack = state.getCurrentTrack();

  // Collect candidates: favorites + search results, deduplicated, up to 20
  const favoritesTracks = await likedSongs.list();
  const uniqueCandidates = favoritesTracks.slice(0, 20);

  const draftDecision = await computeDjDecision({
    llm,
    now,
    systemPrompt,
    userTaste: userPreferences.taste,
    routines: userPreferences.routines,
    moodRules: userPreferences.moodRules,
    recentMemory: recentMemoryEntries.map((entry) => entry.content),
    toolResults: [],
    executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
    environment: {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    },
    candidates: uniqueCandidates
  });

  const queue = state.getQueue();
  let track: Track | null = null;
  let candidateSource: ResolveResult["candidateSource"] = "search";
  let rerankSource: "llm-pick" | "fallback" = "fallback";

  // Try LLM pick first (if it returned a trackId from candidates)
  let llmPickedTrack: Track | undefined;
  if (draftDecision.play.trackId) {
    llmPickedTrack = uniqueCandidates.find((t) => t.id === draftDecision.play.trackId);
  }

  if (llmPickedTrack) {
    try {
      track = await music.resolve(llmPickedTrack);
      candidateSource = favoritesTracks.some((f) => f.id === llmPickedTrack!.id) ? "favorites" : "search";
      rerankSource = "llm-pick";
    } catch {
      llmPickedTrack = undefined;
    }
  }

  // Fall back to deterministic selection if LLM didn't pick or resolve failed
  if (!track) {
    const favoriteCandidate = state.selectCandidate(favoritesTracks);
    if (favoriteCandidate) {
      try {
        track = await music.resolve(favoriteCandidate);
        candidateSource = "favorites";
      } catch {
        candidateSource = "search";
      }
    } else {
      candidateSource = "search";
    }

    // Step 2: If no favorite track resolved, fall back to search
    if (!track) {
      const candidates = await music.search(draftDecision.play.query ?? currentMoodHint);
      const candidate = state.selectCandidate(candidates);
      const queueCandidate = state.selectCandidate(queue);

      if (candidate) {
        track = await music.resolve(candidate);
        candidateSource = "search";
      } else if (queueCandidate) {
        track = await music.resolve(queueCandidate);
        candidateSource = "queue";
      } else {
        const mockMusic = createMockMusicAdapter();
        const fallbackTracks = await mockMusic.search(currentMoodHint);
        track = await mockMusic.resolve(fallbackTracks[0]!);
        candidateSource = "mock";
      }
    }
  }

  const isFallback = candidateSource === "mock";

  const rawDecision = await computeDjDecision({
    llm,
    now,
    systemPrompt,
    userTaste: userPreferences.taste,
    routines: userPreferences.routines,
    moodRules: userPreferences.moodRules,
    recentMemory: recentMemoryEntries.map((entry) => entry.content),
    toolResults: [
      `music.provider: ${musicStatus}`,
      `favorites.available: ${favoritesTracks.length}`,
      `candidates.count: ${uniqueCandidates.length}`,
      `candidates.source: ${candidateSource}`,
      `candidates.rerankSource: ${rerankSource}`,
      ...(isFallback ? ["music.fallback: used mock adapter due to empty results"] : []),
      `music.selectedTrack: ${track.title} - ${track.artist}`,
      ...queue.map((item, index) => `music.queue[${index}]: ${item.title} - ${item.artist}`)
    ],
    executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
    environment: {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    }
  });
  const decision = decisionMentionsTrack(rawDecision, track)
    ? rawDecision
    : buildGroundedFallbackDecision(track, candidateSource);

  return { track, decision, isFallback, candidates: uniqueCandidates, candidateSource, rerankSource };
}

export async function synthesizeWithFallback(
  tts: TtsAdapter,
  ttsCacheDir: string,
  text: string
): Promise<{ result: TtsResult; fallbackReason?: string }> {
  try {
    return { result: await tts.synthesize(text) };
  } catch (error) {
    console.error("TTS synthesis failed, falling back to mock:", error);
    const mockTts = createMockTtsAdapter({ cacheDir: ttsCacheDir });
    return {
      result: await mockTts.synthesize(text),
      fallbackReason: "TTS synthesis failed; fell back to mock TTS"
    };
  }
}

export async function gatherEpisodeSources(
  storySource: StorySourceAdapter,
  publicMetadataAdapter: StorySourceAdapter | undefined,
  webResearchAdapter: StorySourceAdapter | undefined,
  braveApiKey: string | undefined,
  track: Track
): Promise<RadioEpisode["sources"]> {
  let lyricSources: RadioEpisode["sources"] = [];
  try {
    const adapterSources = await storySource.gather(track);
    lyricSources = adapterSources.length > 0 ? adapterSources : [];
  } catch (error) {
    console.warn("Story source gather failed:", error);
    lyricSources = [];
  }

  let metadataSources: RadioEpisode["sources"] = [];
  try {
    const publicMetadata = publicMetadataAdapter ?? (await import("../adapters/index.js")).createPublicMetadataAdapter();
    const adapterSources = await publicMetadata.gather(track);
    metadataSources = adapterSources.length > 0 ? adapterSources : [];
  } catch (error) {
    console.warn("Public metadata gather failed:", error);
    metadataSources = [];
  }

  let webSources: RadioEpisode["sources"] = [];
  try {
    const { createWebResearchAdapter } = await import("../adapters/index.js");
    const webResearch = webResearchAdapter ?? createWebResearchAdapter(
      braveApiKey ? { apiKey: braveApiKey } : {}
    );
    const adapterSources = await webResearch.gather(track);
    webSources = adapterSources.length > 0 ? adapterSources : [];
  } catch (error) {
    console.warn("Web research gather failed:", error);
    webSources = [];
  }

  const combinedSources = [...lyricSources, ...metadataSources, ...webSources];
  return combinedSources.length > 0 ? combinedSources : [
    {
      kind: "mock",
      title: "mock source",
      content: "Placeholder source note for story generation."
    }
  ];
}

export function determineStoryType(sources: RadioEpisode["sources"]): RadioEpisode["story"]["type"] {
  const hasLyricSource = sources.some((s) => s.kind === "lyric");
  const hasBackgroundSource = sources.some((s) =>
    (s.kind === "metadata" || s.kind === "web") && (s.confidence ?? 0) >= 0.5
  );
  return hasBackgroundSource ? "background" : hasLyricSource ? "lyric-theme" : "mood-reading";
}

function hasHighConfidenceBackgroundSource(sources: RadioEpisode["sources"]): boolean {
  return sources.some(
    (s) => (s.kind === "metadata" || s.kind === "web") && (s.confidence ?? 0) >= 0.5
  );
}

function formatSourcesForLLM(sources: RadioEpisode["sources"]): string {
  return sources.map((s) => `[${s.kind}] ${s.title}\n${s.content}`).join("\n---\n");
}

export async function narrateStoryWithSources(
  llm: LlmAdapter,
  track: Track,
  sources: RadioEpisode["sources"],
  systemPrompt: string,
  recentMemory: string[],
  contextEnv: ContextEnvironment,
  userTaste: string,
  routines: string,
  moodRules: string
): Promise<{ narration: string; storyType: RadioEpisode["story"]["type"] }> {
  const rawType = determineStoryType(sources);
  const effectiveType = rawType;

  const sourceContext = formatSourcesForLLM(sources);
  const fragments = buildContextWindow({
    now: new Date(),
    systemPrompt: systemPrompt + `\n\n你是故事叙述者。基于以下曲目来源信息，为听众创作一段电台口播叙述。\n\n曲目: ${track.title} - ${track.artist}\n故事类型: ${effectiveType}\n\n来源:\n${sourceContext}`,
    userTaste,
    routines,
    moodRules,
    recentMemory,
    toolResults: [],
    executionState: "narrate-story",
    environment: contextEnv,
  });

  const decision = await llm.compute(fragments);
  return { narration: decision.say, storyType: effectiveType };
}
