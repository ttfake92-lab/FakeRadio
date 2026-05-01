import { describe, expect, it, vi } from "vitest";
import { createNeteaseHttpClient } from "./netease-http-client.js";
import { createNeteaseHttpMusicAdapter } from "./netease-http-music-adapter.js";

describe("createNeteaseHttpClient", () => {
  it("builds URLs from baseUrl and query params for JSON requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });

    const client = createNeteaseHttpClient({
      baseUrl: "http://127.0.0.1:3300/",
      timeoutMs: 2500,
      fetchImpl
    });

    await expect(
      client.fetchJson("/cloudsearch", { keywords: "warm morning indie", type: 1 })
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:3300/cloudsearch?keywords=warm+morning+indie&type=1");
    expect(init).toMatchObject({
      headers: {
        accept: "application/json"
      }
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("createNeteaseHttpMusicAdapter", () => {
  it("maps search results into FakeRadio tracks", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      result: {
        songs: [
          {
            id: 101,
            name: "Morning Signal",
            dt: 184000,
            al: { name: "Local First Radio", picUrl: "https://example.com/cover.jpg" },
            ar: [{ name: "FakeRadio Session" }]
          }
        ]
      }
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const tracks = await adapter.search("warm morning indie");

    expect(fetchJson).toHaveBeenCalledWith("/cloudsearch", {
      keywords: "warm morning indie",
      limit: 10,
      type: 1
    });
    expect(tracks).toEqual([
      {
        id: "101",
        title: "Morning Signal",
        artist: "FakeRadio Session",
        album: "Local First Radio",
        durationMs: 184000,
        artworkUrl: "https://example.com/cover.jpg",
        source: "netease"
      }
    ]);
  });

  it("uses mood as query for recommend and trims to limit", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      result: {
        songs: [
          { id: 1, name: "A", dt: 1000, al: { name: "Album A" }, ar: [{ name: "Artist A" }] },
          { id: 2, name: "B", dt: 2000, al: { name: "Album B" }, ar: [{ name: "Artist B" }] }
        ]
      }
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const tracks = await adapter.recommend({ mood: "warm morning indie", limit: 1 });

    expect(fetchJson).toHaveBeenCalledWith("/cloudsearch", {
      keywords: "warm morning indie",
      limit: 10,
      type: 1
    });
    expect(tracks).toEqual([
      {
        id: "1",
        title: "A",
        artist: "Artist A",
        album: "Album A",
        durationMs: 1000,
        source: "netease"
      }
    ]);
  });

  it("resolves audioUrl from song url response", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      data: [{ id: 101, url: "https://music.example/101.mp3" }]
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const track = await adapter.resolve({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease"
    });

    expect(fetchJson).toHaveBeenCalledWith("/song/url", { id: "101" });
    expect(track).toEqual({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease",
      audioUrl: "https://music.example/101.mp3"
    });
  });

  it("throws when resolve cannot get an audio url", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      data: [{ id: 101, url: null }]
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });

    await expect(
      adapter.resolve({
        id: "101",
        title: "Morning Signal",
        artist: "FakeRadio Session",
        source: "netease"
      })
    ).rejects.toThrow("Unable to resolve audio URL for track 101");
  });
});
