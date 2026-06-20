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
  it("returns netease adapter when the probe succeeds", async () => {
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

  it("returns a disabled adapter when the netease probe fails", async () => {
    const result = await createMusicAdapter({
      providerMode: "netease",
      probeNetease: vi.fn().mockResolvedValue(false)
    });

    expect(result.status).toBe("disabled");
    expect(result.error).toContain("Netease music service is unavailable");
    await expect(result.music.search("anything")).rejects.toThrow("Netease music service is unavailable");
  });
});
