import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildApiUrl,
  buildMediaUrl,
  buildStreamUrl,
  checkNeteaseQrLogin,
  createNeteaseQrLogin,
  getHealth,
  getNeteaseLoginStatus,
  getServerBaseUrl
} from "./api-client";

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

  it("loads Netease login status and QR login payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ loggedIn: false, cookieStored: false, message: "尚未登录" })
      })
      .mockResolvedValueOnce({
        json: async () => ({ key: "qr-key-1", qrImageUrl: "data:image/png;base64,abc" })
      })
      .mockResolvedValueOnce({
        json: async () => ({ code: 803, message: "授权登录成功", loggedIn: true, cookieSaved: true })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNeteaseLoginStatus()).resolves.toMatchObject({ loggedIn: false });
    await expect(createNeteaseQrLogin()).resolves.toMatchObject({ key: "qr-key-1" });
    await expect(checkNeteaseQrLogin("qr-key-1")).resolves.toMatchObject({ loggedIn: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:3301/api/netease/login/status");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:3301/api/netease/login/qr", {
      method: "POST"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:3301/api/netease/login/qr/qr-key-1");
  });
});
