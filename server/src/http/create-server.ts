import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMusicAdapter,
} from "../adapters/index.js";
import {
  createNeteaseCookieStore,
  createNeteaseAuthService,
  type NeteaseAuthService,
} from "../adapters/music/netease-auth.js";
import { createNeteaseHttpClient } from "../adapters/music/netease-http-client.js";
import type { CalendarAdapter, DeviceAdapter, StorySourceAdapter, TtsAdapter, WeatherAdapter } from "../adapters/types.js";
import { env } from "../config/env.js";
import { createStreamBroadcaster } from "../realtime/stream-bus.js";
import { formatRadioDate } from "../utils/time.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { createSchedulerLoop, createPrewarmScheduler, type PrewarmScheduler } from "../scheduler/scheduler-loop.js";
import { composeEpisodeFromTrack, type ComposeEpisodeDeps } from "../http/episode-runner.js";
import { createInMemoryMemoryRepository } from "../state/memory-repository.js";
import { createStateRepository, type StateRepository } from "../state/state-repository.js";
import { loadUserPreferences, type UserPreferences } from "../user/load-user-preference.js";
import { createFavoritesRepository } from "../user/favorites-repository.js";
import { inferAndSaveTaste } from "../user/taste-inferer.js";
import { createLikedSongsRepository } from "../user/liked-songs-repository.js";
import { createSessionRepository } from "../user/session-repository.js";
import { createTrackRegistry } from "../audio/track-registry.js";
import { createCachedStorySourceAdapter } from "../adapters/story-source/cached-web-research-adapter.js";
import { createProgramBriefRepository } from "../show/program-brief-repository.js";
import { createShowPlanRepository } from "../show/show-plan-repository.js";
import { createShowPlanGenerator } from "../show/show-plan-generator.js";
import { createJobRegistry } from "../show/show-generation-job.js";
import { createShowProjectRepository } from "../show/show-project-repository.js";
import { createDailyShowPlanGenerator } from "../show/daily-show-plan-generator.js";
import { createDailySelectionEngine } from "../show/daily-selection-engine.js";
import { createStateRecentPlayedRepository } from "../show/state-recent-played-repository.js";
import { scheduleTonightBriefIfNeeded, type SchedulerExecutionDeps } from "../show/scheduler-integration.js";
import { buildRecommendationContext, selectRecommendedCandidates } from "../recommendation/recommendation-engine.js";
import { createPlaybackState } from "./playback-state.js";
import { registerRoutes } from "./register-routes.js";
import { createRuntimeAdapterManager } from "./runtime-adapter-manager.js";
import { SettingsSchema } from "@fakeradio/shared";

function loadSystemPrompt(): string {
  try {
    const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
    return readFileSync(resolve(projectRoot, "prompts/dj-persona.md"), "utf-8").trim();
  } catch {
    return "你是 FakeRadio DJ。";
  }
}

type CreateRadioServerOptions = {
  llmAdapter?: import("../adapters/types.js").LlmAdapter;
  musicAdapterResult?: Awaited<ReturnType<typeof createMusicAdapter>>;
  now?: () => Date;
  ttsAdapter?: TtsAdapter;
  ttsCacheDir?: string;
  weatherAdapter?: WeatherAdapter;
  calendarAdapter?: CalendarAdapter;
  deviceAdapter?: DeviceAdapter;
  storySourceAdapter?: StorySourceAdapter;
  publicMetadataAdapter?: StorySourceAdapter;
  webResearchAdapter?: StorySourceAdapter;
  userPreferences?: UserPreferences;
  neteaseAuthService?: NeteaseAuthService;
  baseDir?: string;
  skipStartupPrewarm?: boolean;
};

export async function createRadioServer(options: CreateRadioServerOptions = {}) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]
  });
  await app.register(websocket);

  // Security headers
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    return payload;
  });

  const systemPrompt = loadSystemPrompt();
  const baseDir = options.baseDir ?? resolve(process.cwd());
  const ttsCacheDir = options.ttsCacheDir ?? resolve(process.cwd(), env.FAKERADIO_TTS_CACHE_DIR);
  const stateRepo = createStateRepository(resolve(baseDir, "fakeradio.db"));
  const neteaseCookieStore = createNeteaseCookieStore(resolve(process.cwd(), env.FAKERADIO_NETEASE_COOKIE_FILE));
  const defaultSettings = SettingsSchema.parse({
    providerMode: "netease",
    neteaseBaseUrl: env.FAKERADIO_NETEASE_API_BASE_URL,
    neteaseTimeoutMs: env.FAKERADIO_NETEASE_TIMEOUT_MS,
    neteaseAudioLevel: env.FAKERADIO_NETEASE_AUDIO_LEVEL,
    ttsProvider: env.FAKERADIO_TTS_PROVIDER,
    ttsVoice: env.FAKERADIO_TTS_VOICE,
    mimoVoice: env.FAKERADIO_MIMO_TTS_VOICE,
    ttsStyle: "",
    ttsRate: 0
  });
  const savedSettings = await stateRepo.getPref<unknown>("show:settings");
  const savedSettingsObject: Record<string, unknown> = savedSettings && typeof savedSettings === "object"
    ? { ...(savedSettings as Record<string, unknown>), providerMode: "netease" }
    : {};
  if (savedSettingsObject.ttsProvider === "edge") {
    savedSettingsObject.ttsProvider = "grok";
    if (savedSettingsObject.ttsVoice === "zh-CN-XiaoxiaoNeural") {
      savedSettingsObject.ttsVoice = "eve";
    }
  }
  const initialSettings = SettingsSchema.parse({
    ...defaultSettings,
    ...savedSettingsObject
  });
  const runtimeManager = await createRuntimeAdapterManager({
    cookieStore: neteaseCookieStore,
    ttsCacheDir,
    settings: initialSettings,
    overrides: {
      ...(options.llmAdapter ? { llm: options.llmAdapter } : {}),
      ...(options.musicAdapterResult ? { music: options.musicAdapterResult.music } : {}),
      ...(options.ttsAdapter ? { tts: options.ttsAdapter } : {}),
      ...(options.weatherAdapter ? { weather: options.weatherAdapter } : {}),
      ...(options.calendarAdapter ? { calendar: options.calendarAdapter } : {}),
      ...(options.deviceAdapter ? { devices: options.deviceAdapter } : {}),
      ...(options.storySourceAdapter ? { storySource: options.storySourceAdapter } : {}),
      ...(options.webResearchAdapter ? { webResearchAdapter: createCachedStorySourceAdapter(options.webResearchAdapter) } : {})
    }
  });
  const llm = runtimeManager.llm;
  const music = runtimeManager.music;
  const tts = runtimeManager.tts;
  const weather = runtimeManager.weather;
  const calendar = runtimeManager.calendar;
  const devices = runtimeManager.devices;
  const storySource = runtimeManager.storySource;
  const runtimeStatuses = runtimeManager.getStatuses();
  const neteaseAuth = options.neteaseAuthService ?? createNeteaseAuthService({
    cookieStore: neteaseCookieStore,
    fetchJson: createNeteaseHttpClient({
      baseUrl: initialSettings.neteaseBaseUrl,
      timeoutMs: initialSettings.neteaseTimeoutMs,
      cookieProvider: () => neteaseCookieStore.read()
    }).fetchJson
  });
  const stream = createStreamBroadcaster();
  const memory = createInMemoryMemoryRepository();
  const nowProvider = options.now ?? (() => new Date());
  const favorites = createFavoritesRepository(resolve(process.cwd(), "user/favorites.json"));
  const likedSongs = createLikedSongsRepository(resolve(options.baseDir ?? process.cwd()));
  const sessionRepo = createSessionRepository(resolve(process.cwd(), "user/sessions"), nowProvider);
  const trackRegistry = createTrackRegistry();
  const audioDir = resolve(process.cwd(), "user/audio");
  const exportDir = resolve(process.cwd(), "exports");
  const userPreferences = options.userPreferences ?? (await loadUserPreferences());

  // State
  const { lastPlayedTracks, todayDjMessages, latestPrefs } = await stateRepo.getStartupState();
  const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
  const currentPlanBlock = getCurrentPlanBlock(currentPlan, nowProvider());
  const currentMoodHint = currentPlanBlock?.moodHint ?? "warm morning indie";
  const initialQueue = await (async () => {
    const [weatherSnapshot, calendarItems, likedSongTracks] = await Promise.all([
      weather.current().catch(() => ({ summary: "unknown", moodHint: currentMoodHint })),
      calendar.upcoming().catch(() => []),
      likedSongs.list().catch(() => [])
    ]);
    const context = buildRecommendationContext({
      now: nowProvider(),
      block: currentPlanBlock ?? {
        at: "runtime",
        label: "当前时段",
        moodHint: currentMoodHint
      },
      weather: weatherSnapshot,
      calendar: calendarItems,
      userPreferences,
      likedSongs: likedSongTracks,
      recentTrackIds: new Set(lastPlayedTracks.map((track) => track.trackId)),
      queuedTrackIds: new Set()
    });
    const candidates = await selectRecommendedCandidates({ music, context, limit: 10 }).catch(() => []);
    return candidates.map((candidate) => candidate.track);
  })();
  // 启动队列：每次启动都用新推荐引擎重新推荐 10 首，不再续播上次快照。
  const queueToRestore = initialQueue.filter((track) => (track as { source?: string }).source !== "mock");
  const state = createPlaybackState(queueToRestore, lastPlayedTracks.map((track) => track.trackId));

  // Routes
  const programsDir = resolve(baseDir, "user", "programs");
  const showsDir = resolve(baseDir, "user", "shows");
  const programBriefRepo = createProgramBriefRepository(programsDir);
  const showPlanRepo = createShowPlanRepository(programsDir);
  const showPlanGenerator = createShowPlanGenerator(llm);
  const dailyShowPlanGenerator = createDailyShowPlanGenerator();
  const jobRegistry = createJobRegistry(programsDir);
  const showProjectRepo = createShowProjectRepository(showsDir);
  registerRoutes({
    app, state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir,
    llm, llmStatus: runtimeStatuses.llm, music, musicStatus: runtimeStatuses.music,
    ttsStatus: runtimeStatuses.tts, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, weatherStatus: runtimeStatuses.weather,
    calendar, calendarStatus: runtimeStatuses.calendar, devices, storySource,
    publicMetadataAdapter: options.publicMetadataAdapter,
    webResearchAdapter: runtimeManager.getWebResearchAdapter(),
    currentMoodHint, nowProvider,
    storySourceStatus: runtimeStatuses.storySource,
    webResearchStatus: runtimeStatuses.webResearch,
    neteaseAuth,
    runtimeManager,
    baseDir,
    programBriefRepo,
    showPlanRepo,
    showPlanGenerator,
    dailyShowPlanGenerator,
    jobRegistry,
    showProjectRepo
  });

  const schedulerLoop = createSchedulerLoop({
    nowProvider,
    planBuilder: (now: Date) => buildTodayPlan(now, userPreferences.playlists),
    intervalMs: 60_000,
  });
  schedulerLoop.start();
  app.addHook("onClose", () => schedulerLoop.stop());

  // 统一的默认适配器策略
  const defaultPublicMetadataAdapter = options.publicMetadataAdapter;
  const defaultWebResearchAdapter = runtimeManager.getWebResearchAdapter();

  const prewarmScheduler: PrewarmScheduler = createPrewarmScheduler({
    prewarmTime: env.FAKERADIO_PREWARM_TIME,
    prewarmEnabled: env.FAKERADIO_PREWARM_ENABLED,
    nowProvider,
    onPrewarmTick: async () => {
      if (!env.FAKERADIO_PREWARM_ENABLED) return;

      // 日终品味推断
      try {
        const todaySession = await sessionRepo.getToday();
        if (todaySession.length >= 3) {
          const sessionSummary = todaySession
            .map((e) => `[${e.role}] ${e.text}${e.storyType ? ` (${e.storyType})` : ""}`)
            .join("\n");
          const favList = (await favorites.list()).map((f) => `${f.title} - ${f.artist}`).join(", ");
          await inferAndSaveTaste({
            baseDir, llm, userPreferences, sessionSummary, favList, userMessage: "日终品味推断"
          });
          console.log(`[prewarm] End-of-day taste inference completed.`);
        } else {
          console.log(`[prewarm] Skipped taste inference: not enough session entries (${todaySession.length} < 3).`);
        }
      } catch (err) {
        console.error(`[prewarm] End-of-day taste inference failed:`, err);
      }

      const todayDate = formatRadioDate(nowProvider());

      const recentPlayedRepo = createStateRecentPlayedRepository(stateRepo);
      const dailySelectionEngine = createDailySelectionEngine(recentPlayedRepo, { exclusionWindowDays: 7 });

      try {
        await scheduleTonightBriefIfNeeded(
          {
            briefRepo: programBriefRepo,
            planRepo: showPlanRepo,
            jobRegistry,
            targetDate: todayDate,
            dailyShowPlanGenerator
          },
          {
            briefRepo: programBriefRepo,
            planRepo: showPlanRepo,
            showProjectRepo,
            jobRegistry,
            llm,
            music,
            tts,
            ttsCacheDir,
            weather,
            calendar,
            devices,
            storySource,
            publicMetadataAdapter: defaultPublicMetadataAdapter,
            webResearchAdapter: defaultWebResearchAdapter,
            likedSongs,
            systemPrompt,
            dailySelectionEngine
          }
        );
      } catch (err) {
        console.error(`[prewarm] Theme show scheduler failed for ${todayDate}:`, err);
      }
    }
  });
  prewarmScheduler.start();
  app.addHook("onClose", () => prewarmScheduler.stop());

  // 启动预热第一首：后台为队列第一首生成完整 episode，存入 prepared_episodes，
  // 供首次 /api/episode/next 的 claimPreparedEpisode 秒切，避免首次播放等 LLM+TTS。
  // 进度通过 agent-message 广播进对话框，让用户知道"正在准备"。
  if (!options.skipStartupPrewarm && initialQueue.length > 0 && currentPlanBlock) {
    void prewarmFirstEpisode();
  }

  async function prewarmFirstEpisode() {
    const track = initialQueue[0];
    if (!track || !currentPlanBlock) return;
    const radioDate = formatRadioDate(nowProvider());
    const blockAt = currentPlanBlock.at;
    const composeEpisodeDeps: ComposeEpisodeDeps = {
      llm, tts, ttsCacheDir, storySource,
      publicMetadataAdapter: defaultPublicMetadataAdapter,
      webResearchAdapter: defaultWebResearchAdapter,
      weather, calendar, devices, systemPrompt
    };
    const broadcastProgress = (text: string) => {
      stream.broadcast({
        type: "agent-message",
        payload: { role: "agent", text, trackId: track.id }
      });
    };
    broadcastProgress(`正在为第一首歌《${track.title}》准备口播…`);
    try {
      // 必须先 resolve 拿到 audioUrl：推荐引擎返回的是元数据，无播放链接。
      // 不 resolve 的话预存的 episode.track 没 audioUrl，播放时 /api/audio 的
      // proxyAndRecord 取不到链接 → 404 → "音乐加载失败"（live 路径正常正是因为
      // resolveNextTrackAndDecision 内部已 resolve）。
      const resolvedTrack = await music.resolve(track);
      const recentMemoryEntries = await memory.recent(5);
      const { episode } = await composeEpisodeFromTrack(resolvedTrack, composeEpisodeDeps, {
        recentMemory: recentMemoryEntries.map((entry) => entry.content),
        taste: userPreferences.taste,
        routines: userPreferences.routines,
        moodRules: userPreferences.moodRules
      });
      await stateRepo.savePreparedEpisode({
        radioDate,
        blockAt,
        status: "ready",
        episodeJson: JSON.stringify(episode),
        audioDownloaded: false
      });
      broadcastProgress(`第一首《${track.title}》准备好了，点播放即可开始。`);
    } catch (err) {
      console.error(`[prewarm] First episode preparation failed:`, err);
      broadcastProgress(`第一首口播准备失败，点播放后会现生成，稍等片刻。`);
    }
  }

  return app;
}
