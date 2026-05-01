import { describe, expect, it, vi } from "vitest";
import { createMusicAdapter, probeNeteaseService } from "./create-music-adapter.js";

describe("probeNeteaseService", () => {
  it("returns true when the netease service responds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });

    await expect(
      probeNeteaseService({
        baseUrl: "http://127.0.0.1:3300",
        timeoutMs: 2500,
        fetchImpl
      })
    ).resolves.toBe(true);
  });

  it("returns false when the netease service probe fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      probeNeteaseService({
        baseUrl: "http://127.0.0.1:3300",
        timeoutMs: 2500,
        fetchImpl
      })
    ).resolves.toBe(false);
  });
});

describe("createMusicAdapter", () => {
  it("returns netease adapter when auto mode probe succeeds", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const adapter = {
      search: vi.fn(),
      recommend: vi.fn(),
      resolve: vi.fn()
    };

    const result = await createMusicAdapter({
      providerMode: "auto",
      probeNetease: probe,
      createNeteaseAdapter: () => adapter
    });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.music).toBe(adapter);
  });

  it("returns netease adapter when explicit netease mode probe succeeds", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const adapter = {
      search: vi.fn(),
      recommend: vi.fn(),
      resolve: vi.fn()
    };

    const result = await createMusicAdapter({
      providerMode: "netease",
      probeNetease: probe,
      createNeteaseAdapter: () => adapter
    });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.music).toBe(adapter);
  });

  it("falls back to mock when auto mode probe fails", async () => {
    const result = await createMusicAdapter({
      providerMode: "auto",
      probeNetease: vi.fn().mockResolvedValue(false)
    });

    const [track] = await result.music.search("anything");
    expect(result.status).toBe("mock");
    expect(track?.source).toBe("mock");
  });

  it("falls back to mock when netease mode probe fails", async () => {
    const result = await createMusicAdapter({
      providerMode: "netease",
      probeNetease: vi.fn().mockResolvedValue(false)
    });

    const [track] = await result.music.search("anything");
    expect(result.status).toBe("mock");
    expect(track?.source).toBe("mock");
  });

  it("skips probing in mock mode", async () => {
    const probe = vi.fn();

    const result = await createMusicAdapter({
      providerMode: "mock",
      probeNetease: probe
    });

    expect(probe).not.toHaveBeenCalled();
    expect(result.status).toBe("mock");
  });
});
