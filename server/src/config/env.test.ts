import { describe, expect, it } from "vitest";

import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("uses netease defaults", () => {
    const env = parseEnv({});

    expect(env.FAKERADIO_PROVIDER_MODE).toBe("netease");
    expect(env.FAKERADIO_NETEASE_API_BASE_URL).toBe("http://127.0.0.1:3300");
    expect(env.FAKERADIO_NETEASE_TIMEOUT_MS).toBe(2500);
    expect(env.FAKERADIO_NETEASE_COOKIE_FILE).toBe("user/secrets/netease-cookie.txt");
    expect(env.FAKERADIO_NETEASE_AUDIO_LEVEL).toBe("exhigh");
    expect(env.FAKERADIO_TTS_VOICE).toBe("zh-CN-XiaoxiaoNeural");
    expect(env.FAKERADIO_TTS_CACHE_DIR).toBe("cache/tts");
    expect(env.FAKERADIO_MIMO_TTS_TIMEOUT_MS).toBe(60_000);
  });

  it("supports explicit netease mode", () => {
    const env = parseEnv({
      FAKERADIO_PROVIDER_MODE: "netease",
      FAKERADIO_NETEASE_API_BASE_URL: "http://127.0.0.1:4400",
      FAKERADIO_NETEASE_TIMEOUT_MS: "1800",
      FAKERADIO_NETEASE_AUDIO_LEVEL: "lossless"
    });

    expect(env.FAKERADIO_PROVIDER_MODE).toBe("netease");
    expect(env.FAKERADIO_NETEASE_API_BASE_URL).toBe("http://127.0.0.1:4400");
    expect(env.FAKERADIO_NETEASE_TIMEOUT_MS).toBe(1800);
    expect(env.FAKERADIO_NETEASE_AUDIO_LEVEL).toBe("lossless");
  });

  it("rejects removed provider modes", () => {
    expect(() => parseEnv({ FAKERADIO_PROVIDER_MODE: "mock" })).toThrow();
    expect(() => parseEnv({ FAKERADIO_PROVIDER_MODE: "auto" })).toThrow();
  });

  it("supports custom tts voice and cache dir", () => {
    const env = parseEnv({
      FAKERADIO_TTS_VOICE: "en-US-JennyNeural",
      FAKERADIO_TTS_CACHE_DIR: "/tmp/tts",
      FAKERADIO_MIMO_TTS_TIMEOUT_MS: "90000"
    });

    expect(env.FAKERADIO_TTS_VOICE).toBe("en-US-JennyNeural");
    expect(env.FAKERADIO_TTS_CACHE_DIR).toBe("/tmp/tts");
    expect(env.FAKERADIO_MIMO_TTS_TIMEOUT_MS).toBe(90_000);
  });

  it("enables nightly prewarm by default for always-on local server usage", () => {
    const env = parseEnv({});

    expect(env.FAKERADIO_PREWARM_ENABLED).toBe(true);
    expect(env.FAKERADIO_PREWARM_TIME).toBe("23:30");
    expect(env.FAKERADIO_PREWARM_EPISODES_PER_BLOCK).toBe(3);
  });
});
