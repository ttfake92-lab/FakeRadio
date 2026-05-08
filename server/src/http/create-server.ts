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
  createEdgeTtsAdapter,
  createPublicMetadataAdapter,
  createWebResearchAdapter,
  createNeteaseCookieStore,
  createNeteaseAuthService,
  createNeteaseHttpClient,
  type NeteaseAuthService
} from "../adapters/index.js";
import { createDeepSeekAdapter } from "../adapters/llm/deepseek-llm-adapter.js";
import { createMimoTtsAdapter } from "../adapters/tts/mimo-tts-adapter.js";
import type { CalendarAdapter, DeviceAdapter, StorySourceAdapter, TtsAdapter, WeatherAdapter } from "../adapters/types.js";
import { env } from "../config/env.js";
import { createStreamBroadcaster } from "../realtime/stream-bus.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { createInMemoryMemoryRepository } from "../state/memory-repository.js";
import { createStateRepository, type StateRepository } from "../state/state-repository.js";
import { loadUserPreferences, type UserPreferences } from "../user/load-user-preference.js";
import { createFavoritesRepository } from "../user/favorites-repository.js";
import { createLikedSongsRepository } from "../user/liked-songs-repository.js";
import { createSessionRepository } from "../user/session-repository.js";
import { createTrackRegistry } from "../audio/track-registry.js";
import { createCachedStorySourceAdapter } from "../adapters/story-source/cached-web-research-adapter.js";
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

  const weather = options.weatherAdapter ?? createMockWeatherAdapter();
  const calendar = options.calendarAdapter ?? createMockCalendarAdapter();
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
  const stateRepo = createStateRepository(resolve(process.cwd(), "fakeradio.db"));
  const { lastPlayedTracks, todayDjMessages, lastQueueSnapshot, latestPrefs } = await stateRepo.getStartupState();
  const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
  const currentPlanBlock = getCurrentPlanBlock(currentPlan, nowProvider());
  const currentMoodHint = currentPlanBlock?.moodHint ?? "warm morning indie";
  const initialQueue = await music.recommend({ mood: currentMoodHint, limit: 3 });
  const queueToRestore = lastQueueSnapshot?.trackIds ?? initialQueue;
  const state = createPlaybackState(queueToRestore);

  const effectiveTtsStatus = options.ttsAdapter ? "mock" : ttsStatus;
  const effectiveStorySourceStatus = options.storySourceAdapter ? "ready" : "mock";
  const effectiveWebResearchStatus = (options.webResearchAdapter || env.FAKERADIO_BRAVE_API_KEY) ? "ready" : "disabled";

  // Routes
  registerRoutes({
    app, state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, llmStatus, music, musicStatus,
    ttsStatus: effectiveTtsStatus, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, calendar, devices, storySource,
    publicMetadataAdapter: options.publicMetadataAdapter,
    webResearchAdapter: options.webResearchAdapter ? createCachedStorySourceAdapter(options.webResearchAdapter) : undefined,
    currentMoodHint, nowProvider,
    storySourceStatus: effectiveStorySourceStatus,
    webResearchStatus: effectiveWebResearchStatus,
    neteaseAuth,
    baseDir: resolve(process.cwd())
  });

  return app;
}
