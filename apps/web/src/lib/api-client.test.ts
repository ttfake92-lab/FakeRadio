import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl, buildStreamUrl, getHealth, getServerBaseUrl } from "./api-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api-client", () => {
  it("uses localhost server by default", () => {
    expect(getServerBaseUrl()).toBe("http://localhost:3001");
    expect(buildApiUrl("/api/now")).toBe("http://localhost:3001/api/now");
  });

  it("builds websocket stream url from the default server", () => {
    expect(buildStreamUrl("/stream")).toBe("ws://localhost:3001/stream");
  });

  it("builds secure websocket stream url from https server", () => {
    vi.stubEnv("NEXT_PUBLIC_FAKERADIO_SERVER_URL", "https://radio.local:3443");

    expect(buildStreamUrl("/stream")).toBe("wss://radio.local:3443/stream");
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
