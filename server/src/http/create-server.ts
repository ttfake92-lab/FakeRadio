import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMusicAdapter,
  createMockLlmAdapter,
  createMockStorySourceAdapter,
  createMockWeatherAdapter,
  createWeatherAdapter,
  createEdgeTtsAdapter,
  createPublicMetadataAdapter,
  createWebResearchAdapter,
  createLarkCalendarAdapter,
} from "../adapters/index.js";
import {
  createNeteaseCookieStore,
  createNeteaseAuthService,
  type NeteaseAuthService,
} from "../adapters/music/netease-auth.js";
import { createNeteaseHttpClient } from "../adapters/music/netease-http-client.js";
import { createDeepSeekAdapter } from "../adapters/llm/deepseek-llm-adapter.js";
import { createMimoTtsAdapter } from "../adapters/tts/mimo-tts-adapter.js";
import type { CalendarAdapter, DeviceAdapter, StorySourceAdapter, TtsAdapter, WeatherAdapter } from "../adapters/types.js";
import { env } from "../config/env.js";
import { createStreamBroadcaster } from "../realtime/stream-bus.js";
import { formatRadioDate } from "../utils/time.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { createSchedulerLoop, createPrewarmScheduler, type PrewarmScheduler } from "../scheduler/scheduler-loop.js";
import { runPrewarmForDate, shouldRunPrewarm, markPrewarmRunComplete, type PrewarmDeps } from "../scheduler/daily-episode-prewarmer.js";
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
import { createPlaybackState } from "./playback-state.js";
import { registerRoutes } from "./register-routes.js";

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
};

export async function createRadioServer(options: CreateRadioServerOptions = {}) {
  const app = Fastify({ logger: false });
  const allowedOrigins = [
    "http://localhost:3302",
    "http://127.0.0.1:3302",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  await app.register(cors, {
    origin: allowedOrigins
  });
  await app.register(websocket);

  // Security headers
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    return payload;
  });

  // Adapters
  const llm = options.llmAdapter ??
    (env.FAKERADIO_DEEPSEEK_API_KEY
      ? createDeepSeekAdapter({ apiKey: env.FAKERADIO_DEEPSEEK_API_KEY, model: env.FAKERADIO_DEEPSEEK_MODEL, baseUrl: env.FAKERADIO_DEEPSEEK_BASE_URL })
      : createMockLlmAdapter());
  const llmStatus = options.llmAdapter ? "ready" : env.FAKERADIO_DEEPSEEK_API_KEY ? "ready" : "mock";

  const systemPrompt = loadSystemPrompt();
  const ttsCacheDir = options.ttsCacheDir ?? resolve(process.cwd(), env.FAKERADIO_TTS_CACHE_DIR);
  const neteaseCookieStore = createNeteaseCookieStore(resolve(process.cwd(), env.FAKERADIO_NETEASE_COOKIE_FILE));
  const { music, status: musicStatus } = options.musicAdapterResult ??
    (await createMusicAdapter({
      providerMode: env.FAKERADIO_PROVIDER_MODE,
      baseUrl: env.FAKERADIO_NETEASE_API_BASE_URL,
      timeoutMs: env.FAKERADIO_NETEASE_TIMEOUT_MS,
      cookieProvider: () => neteaseCookieStore.read(),
      audioLevel: env.FAKERADIO_NETEASE_AUDIO_LEVEL
    }));
  const neteaseAuth = options.neteaseAuthService ?? createNeteaseAuthService({
    cookieStore: neteaseCookieStore,
    fetchJson: createNeteaseHttpClient({
      baseUrl: env.FAKERADIO_NETEASE_API_BASE_URL,
      timeoutMs: env.FAKERADIO_NETEASE_TIMEOUT_MS,
      cookieProvider: () => neteaseCookieStore.read()
    }).fetchJson
  });

  let ttsStatus: "ready" | "mock" = "mock";
  const tts = options.ttsAdapter ?? (() => {
    if (env.FAKERADIO_TTS_PROVIDER === "mimo" && env.FAKERADIO_MIMO_API_KEY) {
      ttsStatus = "ready";
      return createMimoTtsAdapter({ apiKey: env.FAKERADIO_MIMO_API_KEY, cacheDir: ttsCacheDir, baseUrl: env.FAKERADIO_MIMO_BASE_URL, voice: env.FAKERADIO_MIMO_TTS_VOICE });
    }
    ttsStatus = "ready";
    return createEdgeTtsAdapter({ cacheDir: ttsCacheDir, voice: env.FAKERADIO_TTS_VOICE });
  })();

  const weather = options.weatherAdapter ?? (env.FAKERADIO_OPENWEATHER_API_KEY
    ? createWeatherAdapter({ apiKey: env.FAKERADIO_OPENWEATHER_API_KEY, city: env.FAKERADIO_WEATHER_CITY })
    : createMockWeatherAdapter());
  const weatherStatus = options.weatherAdapter ? "ready" : env.FAKERADIO_OPENWEATHER_API_KEY ? "ready" : "mock";
  const calendar = options.calendarAdapter ?? (env.FAKERADIO_LARK_CALENDAR_CLIENT_ID && env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET
    ? createLarkCalendarAdapter({ clientId: env.FAKERADIO_LARK_CALENDAR_CLIENT_ID, clientSecret: env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET })
    : createMockCalendarAdapter());
  const calendarStatus = options.calendarAdapter ? "ready" : (env.FAKERADIO_LARK_CALENDAR_CLIENT_ID && env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET) ? "ready" : "mock";
  const devices = options.deviceAdapter ?? createMockDeviceAdapter();
  const storySource = options.storySourceAdapter ?? createMockStorySourceAdapter();
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
  const stateRepo = createStateRepository(resolve(options.baseDir ?? process.cwd(), "fakeradio.db"));
  const { lastPlayedTracks, todayDjMessages, lastQueueSnapshot, latestPrefs } = await stateRepo.getStartupState();
  const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
  const currentPlanBlock = getCurrentPlanBlock(currentPlan, nowProvider());
  const currentMoodHint = currentPlanBlock?.moodHint ?? "warm morning indie";
  const initialQueue = await music.recommend({ mood: currentMoodHint, limit: 3 });
  const queueToRestore = (lastQueueSnapshot?.trackIds && lastQueueSnapshot.trackIds.length > 0) ? lastQueueSnapshot.trackIds : initialQueue;
  const state = createPlaybackState(queueToRestore, lastPlayedTracks.map((track) => track.trackId));

  const effectiveTtsStatus = options.ttsAdapter ? "mock" : ttsStatus;
  const effectiveStorySourceStatus = options.storySourceAdapter ? "ready" : "mock";
  const effectiveWebResearchStatus = (options.webResearchAdapter || env.FAKERADIO_BRAVE_API_KEY) ? "ready" : "disabled";

  // Routes
  const baseDir = options.baseDir ?? resolve(process.cwd());
  const programsDir = resolve(baseDir, "user", "programs");
  const showsDir = resolve(baseDir, "user", "shows");
  const programBriefRepo = createProgramBriefRepository(programsDir);
  const showPlanRepo = createShowPlanRepository(programsDir);
  const showPlanGenerator = createShowPlanGenerator(llm);
  const dailyShowPlanGenerator = createDailyShowPlanGenerator();
  const jobRegistry = createJobRegistry(programsDir);
  const showProjectRepo = createShowProjectRepository(showsDir);
  registerRoutes({
    app, state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, llmStatus, music, musicStatus,
    ttsStatus: effectiveTtsStatus, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, weatherStatus, calendar, calendarStatus, devices, storySource,
    publicMetadataAdapter: options.publicMetadataAdapter,
    webResearchAdapter: options.webResearchAdapter ? createCachedStorySourceAdapter(options.webResearchAdapter) : undefined,
    currentMoodHint, nowProvider,
    storySourceStatus: effectiveStorySourceStatus,
    webResearchStatus: effectiveWebResearchStatus,
    neteaseAuth,
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

  // Prewarm scheduler
  const prewarmDeps: PrewarmDeps = {
    llm,
    music,
    tts,
    ttsCacheDir,
    weather,
    calendar,
    devices,
    storySource,
    publicMetadataAdapter: options.publicMetadataAdapter,
    webResearchAdapter: options.webResearchAdapter ? createCachedStorySourceAdapter(options.webResearchAdapter) : undefined,
    likedSongs,
    stateRepo,
    nowProvider,
    audioDir
  };

  // 统一的默认适配器策略
  const defaultPublicMetadataAdapter = options.publicMetadataAdapter;
  const defaultWebResearchAdapter = options.webResearchAdapter ? createCachedStorySourceAdapter(options.webResearchAdapter) : undefined;

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
      const tomorrow = new Date(nowProvider());
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = formatRadioDate(tomorrow);

      const dailyShowPlanGenerator = createDailyShowPlanGenerator();
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

      const tomorrowPlan = buildTodayPlan(tomorrow, userPreferences.playlists);
      const canRun = await shouldRunPrewarm(prewarmDeps, tomorrowDate);
      if (!canRun) {
        console.log(`[prewarm] Daily prewarm already ran for ${tomorrowDate}, skipping.`);
        return;
      }
      console.log(`[prewarm] Starting daily prewarm for ${tomorrowDate}...`);
      try {
        const results = await runPrewarmForDate(
          prewarmDeps,
          tomorrowDate,
          tomorrowPlan.blocks,
          env.FAKERADIO_PREWARM_EPISODES_PER_BLOCK,
          systemPrompt
        );
        const totalPrepared = results.reduce((s, r) => s + r.prepared, 0);
        const totalFailed = results.reduce((s, r) => s + r.failed, 0);
        console.log(`[prewarm] Daily prewarm completed for ${tomorrowDate}: ${totalPrepared} prepared, ${totalFailed} failed.`);
        await markPrewarmRunComplete(prewarmDeps, tomorrowDate);
      } catch (err) {
        console.error(`[prewarm] Daily prewarm failed for ${tomorrowDate}:`, err);
      }
    }
  });
  prewarmScheduler.start();
  app.addHook("onClose", () => prewarmScheduler.stop());

  return app;
}
