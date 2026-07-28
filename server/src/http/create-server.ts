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
import { runPrewarmForDate, type PrewarmDeps } from "../scheduler/daily-episode-prewarmer.js";
import { createInMemoryMemoryRepository } from "../state/memory-repository.js";
import { createStateRepository, type StateRepository } from "../state/state-repository.js";
import { runStorageCleanup } from "../state/storage-cleanup.js";
import { loadUserPreferences, type UserPreferences } from "../user/load-user-preference.js";
import { createFavoritesRepository } from "../user/favorites-repository.js";
import { createDislikedSongsRepository } from "../user/disliked-songs-repository.js";
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
import { SettingsSchema, type DjPersonaOverride } from "@fakeradio/shared";
import { DJ_PERSONA_PREF_KEY, setPersonaOverride } from "../user/dj-persona-store.js";

function loadSystemPrompt(): string {
  // 本文件在 server/src/http/ 下,仓库根是 ../../../ (之前写成 ../../ 只到 server/,
  // prompts/dj-persona.md 永远读不到,DJ 一直在用兜底的一句话人设)。
  // 两个候选路径: import.meta 推出的仓库根 + process.cwd()(dev 脚本从仓库根启动)。
  const candidates = [
    resolve(fileURLToPath(new URL("../../../", import.meta.url)), "prompts/dj-persona.md"),
    resolve(process.cwd(), "prompts/dj-persona.md")
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8").trim();
    } catch {
      // 尝试下一个候选
    }
  }
  console.warn("[server] prompts/dj-persona.md not found, using minimal fallback persona");
  return "你是 FakeRadio DJ。";
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
  // 恢复用户自定义 DJ 人设(头像面板可编辑),对聊天/口播/预热的 LLM 调用生效
  const savedPersona = await stateRepo.getPref<DjPersonaOverride>(DJ_PERSONA_PREF_KEY);
  setPersonaOverride(savedPersona ?? null);
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
  const dislikes = createDislikedSongsRepository(resolve(process.cwd(), "user/disliked-songs.json"));
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
    const [weatherSnapshot, calendarItems, likedSongTracks, dislikedSongs] = await Promise.all([
      weather.current().catch(() => ({ summary: "unknown", moodHint: currentMoodHint })),
      calendar.upcoming().catch(() => []),
      likedSongs.list().catch(() => []),
      dislikes.list().catch(() => [])
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
      queuedTrackIds: new Set(),
      dislikedSongs
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
    app, state, stateRepo, stream, memory, favorites, dislikes, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir,
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
    showProjectRepo,
    prewarmRefillEnabled: !options.skipStartupPrewarm
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
          const today = formatRadioDate(nowProvider());
          const dislikeList = (await dislikes.list().catch(() => []))
            .filter((d) => d.dislikedAt.startsWith(today))
            .map((d) => `${d.title} - ${d.artist}`)
            .join(", ");
          await inferAndSaveTaste({
            baseDir, llm, userPreferences, sessionSummary, favList, dislikeList, userMessage: "日终品味推断"
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

      await runStorageCleanupSafely("daily");
    }
  });
  prewarmScheduler.start();
  app.addHook("onClose", () => prewarmScheduler.stop());

  // 启动批量预热：后台为当前 block 预生成 N 首完整 episode（含口播 TTS），
  // 存入 prepared_episodes，供 /api/episode/next 和 /api/episode/prefetch 秒切，
  // 避免每首都等 LLM+TTS。N 由 FAKERADIO_PREWARM_STARTUP_EPISODES 控制（默认 10）。
  // 后台 void 异步，不阻塞启动；第一首就绪后即可播放，其余陆续准备。
  // 进度通过 agent-message 广播进对话框，让用户知道"正在准备"。
  if (!options.skipStartupPrewarm && initialQueue.length > 0 && currentPlanBlock) {
    void prewarmStartupEpisodes();
  }

  // 存储回收：服务不一定在每日 tick 时间点开着，启动时也跑一次。
  // 跟随 skipStartupPrewarm 关闭，避免单测里误删 fixture。
  if (!options.skipStartupPrewarm) {
    void runStorageCleanupSafely("startup");
  }

  async function runStorageCleanupSafely(trigger: "startup" | "daily") {
    try {
      const result = await runStorageCleanup({
        stateRepo,
        ttsCacheDir,
        audioDir,
        retentionDays: env.FAKERADIO_STORAGE_RETENTION_DAYS,
        nowProvider
      });
      if (result.dbRowsPruned > 0 || result.ttsFilesDeleted > 0 || result.audioFilesDeleted > 0) {
        console.log(
          `[cleanup] (${trigger}) pruned ${result.dbRowsPruned} db rows, deleted ${result.ttsFilesDeleted} tts + ${result.audioFilesDeleted} audio files older than ${env.FAKERADIO_STORAGE_RETENTION_DAYS}d`
        );
      }
    } catch (err) {
      console.error(`[cleanup] (${trigger}) storage cleanup failed:`, err);
    }
  }

  async function prewarmStartupEpisodes() {
    if (!currentPlanBlock) return;
    const radioDate = formatRadioDate(nowProvider());
    const blockAt = currentPlanBlock.at;
    const targetCount = env.FAKERADIO_PREWARM_STARTUP_EPISODES;
    const broadcastProgress = (text: string) => {
      stream.broadcast({
        type: "agent-message",
        payload: { role: "agent", text }
      });
    };
    broadcastProgress(`正在准备 ${targetCount} 首歌的口播，第一首就绪后即可播放…`);
    const prewarmDeps: PrewarmDeps = {
      llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource,
      publicMetadataAdapter: defaultPublicMetadataAdapter,
      webResearchAdapter: defaultWebResearchAdapter,
      likedSongs, dislikes, stateRepo, nowProvider, audioDir, userPreferences
    };
    try {
      const results = await runPrewarmForDate(
        prewarmDeps,
        radioDate,
        [{ at: currentPlanBlock.at, label: currentPlanBlock.label, moodHint: currentPlanBlock.moodHint }],
        targetCount,
        systemPrompt
      );
      const totalPrepared = results.reduce((sum, r) => sum + r.prepared, 0);
      const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
      if (totalPrepared > 0) {
        broadcastProgress(`${totalPrepared} 首口播已就绪，随时可以播放。`);
      }
      if (totalFailed > 0) {
        console.error(`[prewarm] Startup batch: ${totalFailed} episode(s) failed to prepare.`);
      }
    } catch (err) {
      console.error(`[prewarm] Startup batch preparation failed:`, err);
      broadcastProgress(`口播准备失败，点播放后会现生成，稍等片刻。`);
    }
  }

  return app;
}
