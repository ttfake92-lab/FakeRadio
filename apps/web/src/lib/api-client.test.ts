import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl, buildMediaUrl, buildStreamUrl, getHealth, getServerBaseUrl } from "./api-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api-client", () => {
  it("uses localhost server by default", () => {
    expect(getServerBaseUrl()).toBe("http://localhost:3301");
    expect(buildApiUrl("/api/now")).toBe("http://localhost:3301/api/now");
  });

  it("builds websocket stream url from the default server", () => {
    expect(buildStreamUrl("/stream")).toBe("ws://localhost:3301/stream");
  });

  it("builds secure websocket stream url from https server", () => {
    vi.stubEnv("NEXT_PUBLIC_FAKERADIO_SERVER_URL", "https://radio.local:3443");

    expect(buildStreamUrl("/stream")).toBe("wss://radio.local:3443/stream");
  });

  it("resolves server-relative media urls against the radio server", () => {
    vi.stubEnv("NEXT_PUBLIC_FAKERADIO_SERVER_URL", "http://127.0.0.1:3301");

    expect(buildMediaUrl("/cache/tts/story.mp3")).toBe("http://127.0.0.1:3301/cache/tts/story.mp3");
  });

  it("leaves absolute media urls unchanged", () => {
    expect(buildMediaUrl("https://music.example/track.mp3")).toBe("https://music.example/track.mp3");
  });

  it("loads health payload from local server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          service: "FakeRadio",
          adapters: {
            llm: "mock",
            music: "ready",
            tts: "mock",
            weather: "mock",
            calendar: "mock",
            upnp: "mock"
          },
          checkedAt: "2026-04-30T00:00:00.000Z"
        })
      })
    );

    const health = await getHealth();

    expect(health.adapters.music).toBe("ready");
  });
});
