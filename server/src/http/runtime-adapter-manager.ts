import type { Settings } from "@fakeradio/shared";
import {
  createDisabledCalendarAdapter,
  createDisabledLlmAdapter,
  createDisabledWeatherAdapter,
  createEdgeTtsAdapter,
  createEmptyStorySourceAdapter,
  createLarkCalendarAdapter,
  createLocalBrowserDeviceAdapter,
  createMimoTtsAdapter,
  createMusicAdapter,
  createNeteaseLyricAdapter,
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
      const value = getTarget()[prop as keyof T];
      return typeof value === "function" ? value.bind(getTarget()) : value;
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
        timeoutMs: env.FAKERADIO_MIMO_TTS_TIMEOUT_MS
      });
    }
    return createEdgeTtsAdapter({ cacheDir: ttsCacheDir, voice: settings.ttsVoice });
  })();

  const weather = overrides.weather ?? (env.FAKERADIO_OPENWEATHER_API_KEY
    ? createWeatherAdapter({ apiKey: env.FAKERADIO_OPENWEATHER_API_KEY, city: env.FAKERADIO_WEATHER_CITY })
    : createDisabledWeatherAdapter());
  const weatherStatus: AdapterStatus = overrides.weather ? "ready" : env.FAKERADIO_OPENWEATHER_API_KEY ? "ready" : "disabled";

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
      const nextSnapshot = await buildSnapshot({
        cookieStore: options.cookieStore,
        ttsCacheDir: options.ttsCacheDir,
        settings: nextSettings
      }, options.overrides);
      settings = nextSettings;
      snapshot = nextSnapshot;
      return { settings, statuses: snapshot.statuses };
    }
  };

  return manager;
}

export type RuntimeAdapterManager = Awaited<ReturnType<typeof createRuntimeAdapterManager>>;
