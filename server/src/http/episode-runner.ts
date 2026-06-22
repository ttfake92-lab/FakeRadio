import type { DjDecision, RadioEpisode, Track, TtsResult } from "@fakeradio/shared";
import type { LlmAdapter, MusicAdapter, StorySourceAdapter, TtsAdapter } from "../adapters/types.js";
import { buildContextWindow, type ContextEnvironment } from "../context/context-builder.js";
import { createMacOsSayTtsAdapter } from "../adapters/index.js";
import { env } from "../config/env.js";
import type { MemoryRepository } from "../state/memory-repository.js";
import type { PlaybackState } from "./playback-state.js";
import type { UserPreferences } from "../user/load-user-preference.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import type { WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../adapters/types.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import {
  buildRecommendationContext,
  selectRecommendedCandidates,
  type RecommendationCandidateSource
} from "../recommendation/recommendation-engine.js";

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
  candidateSource: RecommendationCandidateSource | "queue";
  rerankSource: "llm-pick" | "fallback";
  recommendationSignals?: string[];
  recommendationQueries?: string[];
  recommendationSeedCount?: number;
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
    curated: "电台策划推荐",
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
  // 优先槽里的曲目马上就要播，不能让推荐引擎把它当候选再选一次（否则会连播两遍）。
  const priorityNextTrack = state.getPriorityNextTrack();
  if (priorityNextTrack) {
    queueIds.add(priorityNextTrack.id);
    recentOrCurrentTrackIds.add(priorityNextTrack.id);
  }

  const favoritesTracks = await likedSongs.list();
  const currentPlan = buildTodayPlan(now, userPreferences.playlists);
  const currentBlock = getCurrentPlanBlock(currentPlan, now) ?? {
    at: "runtime",
    label: "当前时段",
    moodHint: currentMoodHint
  };
  const recommendationContext = buildRecommendationContext({
    now,
    block: currentBlock,
    weather: weatherSnapshot,
    calendar: calendarItems,
    userPreferences,
    likedSongs: favoritesTracks,
    recentTrackIds: recentOrCurrentTrackIds,
    queuedTrackIds: queueIds
  });
  const recommendedEntries = await selectRecommendedCandidates({
    music,
    context: recommendationContext,
    limit: 20
  });
  const candidateSourceByTrackId = new Map(recommendedEntries.map((entry) => [entry.track.id, entry.source] as const));
  const uniqueCandidates = recommendedEntries.map((entry) => entry.track);

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
      candidateSource = candidateSourceByTrackId.get(llmPickedTrack.id) ?? "curated";
      rerankSource = "llm-pick";
    } catch {
      llmPickedTrack = undefined;
    }
  }

  // Fall back to deterministic selection if LLM didn't pick or resolve failed
  if (!track) {
    for (const candidate of recommendedEntries) {
      try {
        track = await music.resolve(candidate.track);
        candidateSource = candidate.source;
        break;
      } catch {
        // Try the next curated candidate.
      }
    }

    if (!track) {
      const queueCandidate = queue.find(t => !recentOrCurrentTrackIds.has(t.id));
      if (queueCandidate) {
        track = await music.resolve(queueCandidate);
        candidateSource = "queue";
      }
    }

    if (!track) {
      const favoriteCandidate = state.selectCandidate(favoritesTracks);
      if (favoriteCandidate) {
        track = await music.resolve(favoriteCandidate);
        candidateSource = "favorites";
      }
    }

    if (!track) {
      throw new Error("No track available from configured music provider");
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
      `recommendation.signals: ${recommendationContext.signals.join(", ")}`,
      `recommendation.queries: ${recommendationContext.queries.join(" | ")}`,
      `recommendation.seedCount: ${recommendationContext.seedTracks.length}`,
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

  return {
    track,
    decision,
    isFallback,
    candidates: uniqueCandidates,
    candidateSource,
    rerankSource,
    recommendationSignals: recommendationContext.signals,
    recommendationQueries: recommendationContext.queries,
    recommendationSeedCount: recommendationContext.seedTracks.length
  };
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
    const msg = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeMsg = cause instanceof Error ? `${cause.name}: ${cause.message}` : cause !== undefined ? String(cause) : "(no cause)";
    console.error(`[tts] primary synthesis failed, falling back to macOS say: ${msg} | cause=${causeMsg}`);
    console.error("[tts] text was:", text.slice(0, 120));
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

export type ComposeEpisodeDeps = {
  llm: LlmAdapter;
  tts: TtsAdapter;
  ttsCacheDir: string;
  storySource: StorySourceAdapter;
  publicMetadataAdapter?: StorySourceAdapter | undefined;
  webResearchAdapter?: StorySourceAdapter | undefined;
  weather: WeatherAdapter;
  calendar: CalendarAdapter;
  devices: DeviceAdapter;
  systemPrompt: string;
};

export type EpisodeCompositionContext = {
  recentMemory: string[];
  taste: string;
  routines: string;
  moodRules: string;
  // 个人画像(profile.md 内容);为空就不注入 prompt。
  profile?: string;
  // 这首歌在用户历史里的关系(由调用方用 buildPersonalHistorySnippet 算好);
  // 为空就不注入。让 DJ 能说"你之前在晚上听过这位 N 次"这种带温度的话。
  personalHistory?: string;
};

export type ComposedEpisode = {
  episode: RadioEpisode;
  narration: string;
  storyType: RadioEpisode["story"]["type"];
  storyTtsResult: TtsResult;
  fallbackReason: string | undefined;
};

// 统一的 episode 组装：给定已选好的 track，收集 sources、生成口播、合成 TTS、组装 episode。
// 消除 live / prefetch / prewarm / theme-show 四处对 narrate+synthesize 的重复编排。
export async function composeEpisodeFromTrack(
  track: Track,
  deps: ComposeEpisodeDeps,
  context: EpisodeCompositionContext
): Promise<ComposedEpisode> {
  const sources = await gatherEpisodeSources(
    deps.storySource,
    deps.publicMetadataAdapter,
    deps.webResearchAdapter,
    env.FAKERADIO_BRAVE_API_KEY,
    track
  );

  const [weatherSnapshot, calendarItems, playbackDevices] = await Promise.all([
    deps.weather.current(),
    deps.calendar.upcoming(),
    deps.devices.list()
  ]);

  const { narration, storyType } = await narrateStoryWithSources(
    deps.llm,
    track,
    sources,
    deps.systemPrompt,
    context.recentMemory,
    { weather: weatherSnapshot, calendar: calendarItems, devices: playbackDevices },
    context.taste,
    context.routines,
    context.moodRules,
    context.profile,
    context.personalHistory
  );

  const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(deps.tts, deps.ttsCacheDir, narration);

  const episode: RadioEpisode = {
    track,
    story: { text: narration, audioUrl: storyTtsResult.audioUrl, type: storyType },
    sources,
    playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 },
    fallbackReason
  };

  return { episode, narration, storyType, storyTtsResult, fallbackReason };
}

// 算"这首歌在你历史里的关系",给 DJ prompt 用作"老朋友共同记忆"。
// 故意只输出 3-4 行干净事实,不做花式叙事——LLM 自己挑角度带入口播。
// 输入的 playedHistory / likedSongs 越完整,产出的事实越精确;没有就返回空串。
export function buildPersonalHistorySnippet(
  track: Track,
  playedHistory: Array<{ trackId: string; artist: string; playedAt: string }>,
  likedSongs: Track[]
): string {
  const lines: string[] = [];
  const trackArtist = (track.artist ?? "").trim();
  const normalize = (s: string) => s.trim().toLowerCase();
  const targetArtist = normalize(trackArtist);

  // 1) 这首歌本身是否在收藏里
  const isLiked = likedSongs.some((t) => t.id === track.id);
  if (isLiked) lines.push(`这首《${track.title}》在你的收藏里。`);

  // 2) 这位艺术家的其他收藏(最多列 2 首歌名,避免占用太多 token)
  if (targetArtist) {
    const sameArtistLiked = likedSongs.filter(
      (t) => t.id !== track.id && normalize(t.artist ?? "").includes(targetArtist)
    );
    if (sameArtistLiked.length > 0) {
      const titles = sameArtistLiked.slice(0, 2).map((t) => `《${t.title}》`).join("、");
      const more = sameArtistLiked.length > 2 ? `等 ${sameArtistLiked.length} 首` : "";
      lines.push(`你收藏过 ${trackArtist} 的 ${titles}${more}。`);
    }
  }

  // 3) 这位艺术家最近几次出现的次数 + 最近一次时段(按小时分早/午/夜)
  if (targetArtist) {
    const sameArtistPlays = playedHistory.filter((p) =>
      normalize(p.artist ?? "").includes(targetArtist)
    );
    const last = sameArtistPlays[0]; // playedHistory 调用方按 playedAt DESC
    if (last) {
      const hour = new Date(last.playedAt).getHours();
      const slot = hour < 7 ? "凌晨" : hour < 12 ? "早晨" : hour < 18 ? "下午" : hour < 22 ? "傍晚" : "深夜";
      lines.push(`你之前听过 ${trackArtist} ${sameArtistPlays.length} 次,最近一次是在${slot}。`);
    }
  }

  return lines.join("\n");
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
  moodRules: string,
  profile?: string,
  personalHistory?: string
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

  // 把"这首歌在你历史里的关系"显式作为 prompt 段落,而非藏在内存或资料里。
  // 给 DJ 一段可用的"老朋友共同记忆",但不是必须用——LLM 自己判断是否带入。
  const personalSection = personalHistory && personalHistory.trim().length > 0
    ? `

这首歌在听众历史里的关系:
${personalHistory.trim()}

把这段事实当作"老朋友的共同记忆"——如果它有合适的角度可以带进口播,就自然带一句(比如"你之前听过这位三次,都是夜里"或"这位的另一首《X》你收藏过")。但不要硬塞、不要每次都用。`
    : "";

  const baseInput = {
    now: new Date(),
    systemPrompt: systemPrompt + `

现在为即将播放的歌写一段电台口播。这段话会被 TTS 朗读，压在歌曲前奏的垫乐上。

曲目: ${track.title} - ${track.artist}
故事类型: ${effectiveType}

写法要求:
- 2 到 7 句,密度自己判断:有真实细节就多说一点,没有可讲的就极简带过。
- ${typeGuidance[effectiveType]}
- 只讲一个点,讲透,不要面面俱到。
- 行文中自然带到歌名或歌手名,但禁止用「接下来是 XXX 的 XXX」这种报幕腔开场。
- 结尾把话头轻轻交给音乐即可,不要说「让我们一起聆听」之类的主持词。${personalSection}

来源资料:
${sourceContext}`,
    userTaste,
    routines,
    moodRules,
    recentMemory,
    toolResults: [],
    executionState: "narrate-story",
    environment: contextEnv,
  };
  // profile 严格可选(exactOptionalPropertyTypes):有内容才挂上,避免 undefined 写入。
  const fragments = profile && profile.trim().length > 0
    ? buildContextWindow({ ...baseInput, profile })
    : buildContextWindow(baseInput);

  const decision = await llm.compute(fragments);
  const narration = narrationMentionsTrack(decision.say, track)
    && respectsPersonaRules(decision.say)
    ? decision.say
    : buildGroundedFallbackNarration(track, effectiveType);
  return { narration, storyType: effectiveType };
}
