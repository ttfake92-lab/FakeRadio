import type { DjDecision, RadioEpisode, Track, TtsResult } from "@fakeradio/shared";
import type { LlmAdapter, MusicAdapter, StorySourceAdapter, TtsAdapter } from "../adapters/types.js";
import { buildContextWindow, type ContextEnvironment } from "../context/context-builder.js";
import { createMacOsSayTtsAdapter } from "../adapters/index.js";
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
  candidateSource: "favorites" | "search" | "queue";
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

const FORBIDDEN_DJ_PHRASES = [
  "这首歌背后有一个动人的故事",
  "让我们一起聆听",
  "希望你喜欢",
  "这首歌讲述了",
  "藏着说不出的情绪",
  "治愈",
  "岁月静好"
];

function respectsPersonaRules(text: string): boolean {
  return !FORBIDDEN_DJ_PHRASES.some((phrase) => text.includes(phrase));
}

function buildGroundedFallbackDecision(
  track: Track,
  candidateSource: ResolveResult["candidateSource"]
): DjDecision {
  const sourceLabel: Record<ResolveResult["candidateSource"], string> = {
    favorites: "你的收藏库",
    search: "网易云搜索结果",
    queue: "当前队列"
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
  const recentOrCurrentTrackIds = new Set([
    ...state.getRecentlySelectedTrackIds(),
    ...(currentTrack ? [currentTrack.id] : [])
  ]);
  const queueIds = new Set(state.getQueue().map(t => t.id));

  // Collect candidates: favorites + search results, deduplicated, up to 20
  const favoritesTracks = await likedSongs.list();
  const uniqueCandidates = favoritesTracks
    .filter((track) => !recentOrCurrentTrackIds.has(track.id) && !queueIds.has(track.id))
    .slice(0, 20);

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
      const candidates = (await music.search(draftDecision.play.query ?? currentMoodHint))
        .filter((candidate) => !recentOrCurrentTrackIds.has(candidate.id));
      const candidate = candidates[0];
      const queueCandidate = queue.find(t => !recentOrCurrentTrackIds.has(t.id));

      if (candidate) {
        track = await music.resolve(candidate);
        candidateSource = "search";
      } else if (queueCandidate) {
        track = await music.resolve(queueCandidate);
        candidateSource = "queue";
      } else {
        throw new Error("No track available from configured music provider");
      }
    }
  }

  const isFallback = false;

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
      `recentlySelected.count: ${recentOrCurrentTrackIds.size}`,
      `candidates.source: ${candidateSource}`,
      `candidates.rerankSource: ${rerankSource}`,
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
    && respectsPersonaRules(rawDecision.say)
    ? rawDecision
    : buildGroundedFallbackDecision(track, candidateSource);

  return { track, decision, isFallback, candidates: uniqueCandidates, candidateSource, rerankSource };
}

export async function synthesizeWithFallback(
  tts: TtsAdapter,
  ttsCacheDir: string,
  text: string,
  options: {
    audibleFallback?: TtsAdapter;
  } = {}
): Promise<{ result: TtsResult; fallbackReason?: string }> {
  try {
    return { result: await tts.synthesize(text) };
  } catch (error) {
    console.error("TTS synthesis failed, falling back to local audible TTS:", error);
    try {
      const audibleFallback = options.audibleFallback ?? createMacOsSayTtsAdapter({ cacheDir: ttsCacheDir });
      return {
        result: await audibleFallback.synthesize(text),
        fallbackReason: "TTS synthesis failed; fell back to local audible TTS"
      };
    } catch (fallbackError) {
      console.error("Local audible TTS fallback failed:", fallbackError);
      throw new Error("TTS synthesis failed and local audible fallback failed");
    }
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
  if (publicMetadataAdapter) {
    try {
      const adapterSources = await publicMetadataAdapter.gather(track);
      metadataSources = adapterSources.length > 0 ? adapterSources : [];
    } catch (error) {
      console.warn("Public metadata gather failed:", error);
      metadataSources = [];
    }
  }

  let webSources: RadioEpisode["sources"] = [];
  if (webResearchAdapter) {
    try {
      const adapterSources = await webResearchAdapter.gather(track);
      webSources = adapterSources.length > 0 ? adapterSources : [];
    } catch (error) {
      console.warn("Web research gather failed:", error);
      webSources = [];
    }
  }

  return [...lyricSources, ...metadataSources, ...webSources];
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

function narrationMentionsTrack(narration: string, track: Track): boolean {
  const haystack = normalizeForMatch(narration);
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(track.artist);
  return haystack.includes(title) || haystack.includes(artist);
}

function buildGroundedFallbackNarration(track: Track, storyType: RadioEpisode["story"]["type"]): string {
  if (storyType === "lyric-theme") {
    return `${track.artist} 写 ${track.title} 的时候，大概也是这样一个安静的时段。歌词不用我念，你听到那句就明白了。`;
  }
  if (storyType === "background") {
    return `这首 ${track.title} 我留了很久，${track.artist} 的版本最耐听。先放歌，背景的事下次慢慢说。`;
  }
  return `不解释了，${track.artist} 的 ${track.title}，放在现在这个时间点刚刚好。`;
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
  const typeGuidance: Record<RadioEpisode["story"]["type"], string> = {
    background:
      "资料里有真实的创作背景：挑一个最有画面感的事实（年份、地点、人物、一件事）讲出来，像朋友顺口说起一件你刚好知道的事。不要罗列多个事实。",
    "lyric-theme":
      "资料里有歌词：挑一句最有画面感的歌词意象，把它和此刻的时间或心境连起来。不要逐句解读，不要复述整段歌词。",
    "mood-reading":
      "没有可靠的背景资料：不要假装知道幕后故事。谈这首歌的声音本身——节奏、人声的质感、某件乐器——以及它为什么适合现在这个时刻。"
  };

  const fragments = buildContextWindow({
    now: new Date(),
    systemPrompt: systemPrompt + `

现在为即将播放的歌写一段电台口播。这段话会被 TTS 朗读，压在歌曲前奏的垫乐上。

曲目: ${track.title} - ${track.artist}
故事类型: ${effectiveType}

写法要求:
- 2 到 4 句，口语，像电台里随口聊起，说完自然停住。
- ${typeGuidance[effectiveType]}
- 只讲一个点，讲透，不要面面俱到。
- 行文中自然带到歌名或歌手名，但禁止用「接下来是 XXX 的 XXX」这种报幕腔开场。
- 结尾把话头轻轻交给音乐即可，不要说「让我们一起聆听」之类的主持词。

来源资料:
${sourceContext}`,
    userTaste,
    routines,
    moodRules,
    recentMemory,
    toolResults: [],
    executionState: "narrate-story",
    environment: contextEnv,
  });

  const decision = await llm.compute(fragments);
  const narration = narrationMentionsTrack(decision.say, track)
    && respectsPersonaRules(decision.say)
    ? decision.say
    : buildGroundedFallbackNarration(track, effectiveType);
  return { narration, storyType: effectiveType };
}
