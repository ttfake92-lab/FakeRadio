import { describe, expect, it, vi } from "vitest";
import { createNeteaseLyricAdapter } from "./netease-lyric-adapter.js";
import type { Track } from "@fakeradio/shared";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "123456",
    title: "Test Song",
    artist: "Test Artist",
    album: "Test Album",
    source: "netease",
    ...overrides
  };
}

describe("createNeteaseLyricAdapter", () => {
  it("returns lyric source notes with stripped timestamps and first 8 lines", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      lrc: {
        lyric:
          "[00:00.000]第一行歌词\n[00:05.000]第二行歌词\n[00:10.000]第三行歌词\n[00:15.000]第四行歌词\n[00:20.000]第五行歌词\n[00:25.000]第六行歌词\n[00:30.000]第七行歌词\n[00:35.000]第八行歌词\n[00:40.000]第九行歌词"
      }
    });

    const adapter = createNeteaseLyricAdapter({ fetchJson });
    const result = await adapter.gather(makeTrack());

    expect(fetchJson).toHaveBeenCalledWith("/lyric", { id: "123456" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "lyric",
      title: "Test Song",
      content: "第一行歌词\n第二行歌词\n第三行歌词\n第四行歌词\n第五行歌词\n第六行歌词\n第七行歌词\n第八行歌词"
    });
  });

  it("returns empty array when lyric is empty string", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      lrc: { lyric: "" }
    });

    const adapter = createNeteaseLyricAdapter({ fetchJson });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when lrc field is missing", async () => {
    const fetchJson = vi.fn().mockResolvedValue({});

    const adapter = createNeteaseLyricAdapter({ fetchJson });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("throws when fetchJson fails", async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error("Netease down"));

    const adapter = createNeteaseLyricAdapter({ fetchJson });
    await expect(adapter.gather(makeTrack())).rejects.toThrow("Netease down");
  });

  it("uses baseUrl and timeoutMs to build fetchJson when not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lrc: { lyric: "[00:00.000]简单歌词" }
      })
    });

    const adapter = createNeteaseLyricAdapter({
      baseUrl: "http://localhost:3300",
      timeoutMs: 3000,
      fetchImpl: mockFetch
    });

    const result = await adapter.gather(makeTrack({ id: "999" }));

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/lyric?id=999");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("简单歌词");
  });
});
