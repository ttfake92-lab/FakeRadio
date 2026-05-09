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
      client.fetchJson("/cloudsearch", { query: { keywords: "warm morning indie", type: 1 } })
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain("http://127.0.0.1:3300/cloudsearch?keywords=warm+morning+indie&type=1");
    expect(url).toContain("timestamp=");
    expect(init).toMatchObject({
      headers: {
        accept: "application/json"
      }
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the stored Netease cookie with JSON requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });

    const client = createNeteaseHttpClient({
      baseUrl: "http://127.0.0.1:3300",
      timeoutMs: 2500,
      fetchImpl,
      cookieProvider: async () => "MUSIC_U=stored-cookie"
    });

    await client.fetchJson("/login/status");

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      headers: {
        accept: "application/json",
        cookie: "MUSIC_U=stored-cookie"
      }
    });
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
      method: "POST",
      query: {
        keywords: "warm morning indie",
        limit: 10,
        type: 1 }
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
      method: "POST",
      query: {
        keywords: "warm morning indie",
        limit: 10,
        type: 1 }
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

  it("resolves audioUrl from the preferred high quality song url endpoint", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      data: [{ id: 101, url: "https://music.example/101.mp3" }]
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson, audioLevel: "exhigh" });
    const track = await adapter.resolve({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease"
    });

    expect(fetchJson).toHaveBeenCalledWith("/song/url/v1", {
      method: "POST",
      query: { id: "101", level: "exhigh" }
    });
    expect(track).toEqual({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease",
      audioUrl: "https://music.example/101.mp3"
    });
  });

  it("falls back to the legacy song url endpoint when high quality resolve has no URL", async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 101, url: null }] })
      .mockResolvedValueOnce({ data: [{ id: 101, url: "https://music.example/101-fallback.mp3" }] });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson, audioLevel: "lossless" });
    const track = await adapter.resolve({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease"
    });

    expect(fetchJson).toHaveBeenNthCalledWith(1, "/song/url/v1", {
      method: "POST",
      query: { id: "101", level: "lossless" }
    });
    expect(fetchJson).toHaveBeenNthCalledWith(2, "/song/url", {
      method: "POST",
      query: { id: "101" }
    });
    expect(track.audioUrl).toBe("https://music.example/101-fallback.mp3");
  });

  it("falls back to the legacy song url endpoint when high quality resolve rejects", async () => {
    const fetchJson = vi.fn()
      .mockRejectedValueOnce(new Error("Netease HTTP request failed: 404 Not Found"))
      .mockResolvedValueOnce({ data: [{ id: 101, url: "https://music.example/101-legacy.mp3" }] });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson, audioLevel: "hires" });
    const track = await adapter.resolve({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease"
    });

    expect(fetchJson).toHaveBeenNthCalledWith(1, "/song/url/v1", {
      method: "POST",
      query: { id: "101", level: "hires" }
    });
    expect(fetchJson).toHaveBeenNthCalledWith(2, "/song/url", {
      method: "POST",
      query: { id: "101" }
    });
    expect(track.audioUrl).toBe("https://music.example/101-legacy.mp3");
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

  it("passes cookieProvider to the internal HTTP client so requests carry auth cookie", async () => {
    const capturedHeaders: Record<string, string> = {};
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { songs: [] } })
    });
    // Intercept to capture headers on the first call
    const interceptorFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.headers && typeof init.headers === "object") {
        Object.assign(capturedHeaders, init.headers as Record<string, string>);
      }
      return fakeFetch(url, init);
    });

    const adapter = createNeteaseHttpMusicAdapter({
      baseUrl: "http://127.0.0.1:3300",
      timeoutMs: 2500,
      fetchImpl: interceptorFetch,
      cookieProvider: async () => "MUSIC_U=test-session-cookie"
    });

    await adapter.search("ambient focus");

    expect(capturedHeaders["cookie"]).toBe("MUSIC_U=test-session-cookie");
  });
});
