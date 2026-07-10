import type { Settings } from "@fakeradio/shared";
import {
  createDisabledCalendarAdapter,
  createDisabledLlmAdapter,
  createDisabledWeatherAdapter,
  createEmptyStorySourceAdapter,
  createFishTtsAdapter,
  createGrokTtsAdapter,
  createLarkCalendarAdapter,
  createLocalBrowserDeviceAdapter,
  createMimoTtsAdapter,
  createMusicAdapter,
  createNeteaseLyricAdapter,
  createOpenMeteoWeatherAdapter,
  createWeatherAdapter,
  createWebResearchAdapter
} from "../adapters/index.js";
import type {
  AdapterStatus,
  CalendarAdapter,
  DeviceAdapter,
  LlmAdapter,
  MusicAdapter,
  StorySourceAdapter,
  TtsAdapter,
  WeatherAdapter
} from "../adapters/types.js";
import { createDeepSeekAdapter } from "../adapters/llm/deepseek-llm-adapter.js";
import type { NeteaseCookieStore } from "../adapters/music/netease-auth.js";
import { env } from "../config/env.js";

function getXaiApiKey() {
  return env.FAKERADIO_XAI_API_KEY ?? env.XAI_API_KEY;
}

function rateToGrokSpeed(rate: number): number {
  return Math.min(1.5, Math.max(0.7, 1 + rate / 100));
}

function rateToFishSpeed(rate: number): number {
  return Math.min(2, Math.max(0.5, 1 + rate / 100));
}

export type RuntimeAdapterStatuses = {
  llm: AdapterStatus;
  music: AdapterStatus;
  tts: AdapterStatus;
  weather: AdapterStatus;
  calendar: AdapterStatus;
  upnp: AdapterStatus;
  storySource: AdapterStatus;
  webResearch: AdapterStatus;
};

export type RuntimeAdapterSnapshot = {
  llm: LlmAdapter;
  music: MusicAdapter;
  tts: TtsAdapter;
  weather: WeatherAdapter;
  calendar: CalendarAdapter;
  devices: DeviceAdapter;
  storySource: StorySourceAdapter;
  webResearchAdapter?: StorySourceAdapter;
  statuses: RuntimeAdapterStatuses;
};

type RuntimeAdapterManagerOptions = {
  cookieStore: NeteaseCookieStore;
  ttsCacheDir: string;
  settings: Settings;
  overrides?: Partial<RuntimeAdapterSnapshot>;
};

function proxyAdapter<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = getTarget();
      const value = target[prop as keyof T];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

async function buildSnapshot(
  options: Omit<RuntimeAdapterManagerOptions, "overrides">,
  overrides: Partial<RuntimeAdapterSnapshot> = {}
): Promise<RuntimeAdapterSnapshot> {
  const { settings, cookieStore, ttsCacheDir } = options;

  const llm = overrides.llm ?? (env.FAKERADIO_DEEPSEEK_API_KEY
    ? createDeepSeekAdapter({
        apiKey: env.FAKERADIO_DEEPSEEK_API_KEY,
        model: env.FAKERADIO_DEEPSEEK_MODEL,
        baseUrl: env.FAKERADIO_DEEPSEEK_BASE_URL
      })
    : createDisabledLlmAdapter("FAKERADIO_DEEPSEEK_API_KEY is not configured"));
  const llmStatus: AdapterStatus = overrides.llm ? "ready" : env.FAKERADIO_DEEPSEEK_API_KEY ? "ready" : "disabled";

  const musicResult = overrides.music
    ? { music: overrides.music, status: "ready" as AdapterStatus }
    : await createMusicAdapter({
        providerMode: "netease",
        baseUrl: settings.neteaseBaseUrl,
        timeoutMs: settings.neteaseTimeoutMs,
        cookieProvider: () => cookieStore.read(),
        audioLevel: settings.neteaseAudioLevel
      });

  let ttsStatus: AdapterStatus = "ready";
  const tts = overrides.tts ?? (() => {
    if (settings.ttsProvider === "mimo") {
      if (!env.FAKERADIO_MIMO_API_KEY) {
        ttsStatus = "disabled";
        return createDisabledTtsAdapter("FAKERADIO_MIMO_API_KEY is not configured");
      }
      return createMimoTtsAdapter({
        apiKey: env.FAKERADIO_MIMO_API_KEY,
        cacheDir: ttsCacheDir,
        baseUrl: env.FAKERADIO_MIMO_BASE_URL,
        voice: settings.mimoVoice,
        style: settings.ttsStyle,
        timeoutMs: env.FAKERADIO_MIMO_TTS_TIMEOUT_MS
      });
    }
    if (settings.ttsProvider === "fish") {
      if (!env.FAKERADIO_FISH_API_KEY) {
        ttsStatus = "disabled";
        return createDisabledTtsAdapter("FAKERADIO_FISH_API_KEY is not configured");
      }
      if (!settings.fishVoiceId.trim()) {
        ttsStatus = "disabled";
        return createDisabledTtsAdapter("Fish Audio Voice ID 未填写，请在设置 → TTS Voice 中填入");
      }
      return createFishTtsAdapter({
        apiKey: env.FAKERADIO_FISH_API_KEY,
        cacheDir: ttsCacheDir,
        baseUrl: env.FAKERADIO_FISH_BASE_URL,
        model: env.FAKERADIO_FISH_TTS_MODEL,
        voiceId: settings.fishVoiceId,
        speed: rateToFishSpeed(settings.ttsRate),
        style: settings.ttsStyle,
        timeoutMs: env.FAKERADIO_FISH_TTS_TIMEOUT_MS
      });
    }
    const xaiApiKey = getXaiApiKey();
    if (!xaiApiKey) {
      ttsStatus = "disabled";
      return createDisabledTtsAdapter("FAKERADIO_XAI_API_KEY or XAI_API_KEY is not configured");
    }
    return createGrokTtsAdapter({
      apiKey: xaiApiKey,
      cacheDir: ttsCacheDir,
      baseUrl: env.FAKERADIO_XAI_TTS_BASE_URL,
      voice: settings.ttsVoice,
      language: env.FAKERADIO_XAI_TTS_LANGUAGE,
      speed: rateToGrokSpeed(settings.ttsRate),
      style: settings.ttsStyle,
      timeoutMs: env.FAKERADIO_XAI_TTS_TIMEOUT_MS
    });
  })();

  // 天气默认走 Open-Meteo(免 key 开箱即用);配置了 OpenWeatherMap key 时优先用它。
  // 之前没 key 时天气 disabled,推荐/口播完全感知不到天气。
  // FAKERADIO_WEATHER_PROVIDER=disabled 保留给单测(不打真实网络)。
  const useOpenWeatherMap = env.FAKERADIO_WEATHER_PROVIDER === "openweathermap"
    || (env.FAKERADIO_WEATHER_PROVIDER === "auto" && !!env.FAKERADIO_OPENWEATHER_API_KEY);
  const weatherDisabled = env.FAKERADIO_WEATHER_PROVIDER === "disabled"
    || (useOpenWeatherMap && !env.FAKERADIO_OPENWEATHER_API_KEY);
  // 城市优先用 settings.weatherCity(个人资料面板可编辑,applySettings 时重建 adapter 生效),
  // 空串回退到环境变量默认值。
  const weatherCity = settings.weatherCity?.trim() || env.FAKERADIO_WEATHER_CITY;
  const weather = overrides.weather ?? (weatherDisabled
    ? createDisabledWeatherAdapter()
    : useOpenWeatherMap
      ? createWeatherAdapter({ apiKey: env.FAKERADIO_OPENWEATHER_API_KEY!, city: weatherCity })
      : createOpenMeteoWeatherAdapter({ city: weatherCity }));
  const weatherStatus: AdapterStatus = overrides.weather ? "ready" : weatherDisabled ? "disabled" : "ready";

  const calendar = overrides.calendar ?? (env.FAKERADIO_LARK_CALENDAR_CLIENT_ID && env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET
    ? createLarkCalendarAdapter({
        clientId: env.FAKERADIO_LARK_CALENDAR_CLIENT_ID,
        clientSecret: env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET
      })
    : createDisabledCalendarAdapter());
  const calendarStatus: AdapterStatus = overrides.calendar ? "ready" : (env.FAKERADIO_LARK_CALENDAR_CLIENT_ID && env.FAKERADIO_LARK_CALENDAR_CLIENT_SECRET) ? "ready" : "disabled";

  const storySource = overrides.storySource ?? createNeteaseLyricAdapter({
    baseUrl: settings.neteaseBaseUrl,
    timeoutMs: settings.neteaseTimeoutMs,
    cookieProvider: () => cookieStore.read()
  });
  const webResearchAdapter = overrides.webResearchAdapter ?? (settings.researchEnabled && env.FAKERADIO_BRAVE_API_KEY
    ? createWebResearchAdapter({ apiKey: env.FAKERADIO_BRAVE_API_KEY })
    : undefined);

  return {
    llm,
    music: musicResult.music,
    tts,
    weather,
    calendar,
    devices: overrides.devices ?? createLocalBrowserDeviceAdapter(),
    storySource: overrides.storySource ?? storySource ?? createEmptyStorySourceAdapter(),
    ...(webResearchAdapter ? { webResearchAdapter } : {}),
    statuses: {
      llm: llmStatus,
      music: musicResult.status,
      tts: overrides.tts ? "ready" : ttsStatus,
      weather: weatherStatus,
      calendar: calendarStatus,
      upnp: "disabled",
      storySource: "ready",
      webResearch: webResearchAdapter ? "ready" : "disabled"
    }
  };
}

function createDisabledTtsAdapter(reason: string): TtsAdapter {
  return {
    async synthesize() {
      throw new Error(reason);
    }
  };
}

export async function createRuntimeAdapterManager(options: RuntimeAdapterManagerOptions) {
  let settings = options.settings;
  let snapshot = await buildSnapshot(options, options.overrides);

  const manager = {
    llm: proxyAdapter(() => snapshot.llm),
    music: proxyAdapter(() => snapshot.music),
    tts: proxyAdapter(() => snapshot.tts),
    weather: proxyAdapter(() => snapshot.weather),
    calendar: proxyAdapter(() => snapshot.calendar),
    devices: proxyAdapter(() => snapshot.devices),
    storySource: proxyAdapter(() => snapshot.storySource),
    webResearchAdapter: proxyAdapter(() => snapshot.webResearchAdapter ?? createEmptyStorySourceAdapter()),

    getSettings() {
      return settings;
    },

    getStatuses() {
      return snapshot.statuses;
    },

    getWebResearchAdapter() {
      return snapshot.webResearchAdapter;
    },

    async applySettings(nextSettings: Settings) {
      const nextVoice = nextSettings.ttsProvider === 'mimo'
        ? nextSettings.mimoVoice
        : nextSettings.ttsProvider === 'fish'
          ? nextSettings.fishVoiceId
          : nextSettings.ttsVoice;
      console.log(`[runtime-adapter] applySettings called: provider=${nextSettings.ttsProvider} voice=${nextVoice} style=${nextSettings.ttsStyle}`);
      const nextSnapshot = await buildSnapshot({
        cookieStore: options.cookieStore,
        ttsCacheDir: options.ttsCacheDir,
        settings: nextSettings
      }, options.overrides);
      settings = nextSettings;
      snapshot = nextSnapshot;
      console.log(`[runtime-adapter] snapshot.tts replaced, ttsStatus=${snapshot.statuses.tts}`);
      return { settings, statuses: snapshot.statuses };
    }
  };

  return manager;
}

export type RuntimeAdapterManager = Awaited<ReturnType<typeof createRuntimeAdapterManager>>;
