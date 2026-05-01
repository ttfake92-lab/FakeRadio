import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockMusicAdapter, createMockStorySourceAdapter, createMockTtsAdapter } from "../adapters/index.js";
import { createRadioServer } from "./create-server.js";

let app: FastifyInstance | undefined;

function createMockMusicAdapterResult() {
  return {
    music: createMockMusicAdapter(),
    status: "mock" as const
  };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("createRadioServer", () => {
  it("serves health, now, plan, next, taste, and chat contracts", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().service).toBe("FakeRadio");
    expect(health.json().adapters.storySource).toBe("mock");

    const now = await app.inject({ method: "GET", url: "/api/now" });
    expect(now.statusCode).toBe(200);
    expect(now.json().playback).toBe("idle");

    const plan = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().blocks).toHaveLength(3);

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    expect(taste.json().playlists[0].id).toBe("morning-soft-start");

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(next.json().track.id).toBe("mock-track-001");

    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "来点适合写代码的"
      }
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().decision.play.query).toBe("warm morning indie");
  });

  it("keeps the latest DJ speech in now after computing next", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);

    const nextBody = next.json();
    const now = await app.inject({ method: "GET", url: "/api/now" });

    expect(now.statusCode).toBe(200);
    expect(now.json()).toMatchObject({
      playback: "playing",
      track: {
        id: nextBody.track.id
      },
      dj: {
        say: nextBody.decision.say,
        audioUrl: nextBody.tts.audioUrl,
        segue: nextBody.decision.segue
      }
    });
  });

  it("allows the local web app origin during development", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const health = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "http://127.0.0.1:3002"
      }
    });

    expect(health.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3002");
  });

  it("uses the selected music adapter for health, initial queue, and next track", async () => {
    const queueTrack = {
      id: "netease-queue-001",
      title: "Queue Starter",
      artist: "Adapter Artist",
      album: "Adapter Album",
      durationMs: 180000,
      source: "netease" as const
    };
    const candidateTrack = {
      id: "netease-search-001",
      title: "Search Result",
      artist: "Adapter Artist",
      album: "Adapter Album",
      durationMs: 210000,
      source: "netease" as const
    };
    const resolvedTrack = {
      ...candidateTrack,
      audioUrl: "https://example.com/audio/netease-search-001.mp3"
    };
    const music = {
      recommend: vi.fn().mockResolvedValue([queueTrack]),
      search: vi.fn().mockResolvedValue([candidateTrack]),
      resolve: vi.fn().mockResolvedValue(resolvedTrack)
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 8, 0, 0),
      ttsAdapter: createMockTtsAdapter()
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().adapters.music).toBe("ready");
    expect(health.json().adapters.storySource).toBe("mock");

    const nowBeforeNext = await app.inject({ method: "GET", url: "/api/now" });
    expect(nowBeforeNext.statusCode).toBe(200);
    expect(nowBeforeNext.json().queue).toEqual([queueTrack]);
    expect(music.recommend).toHaveBeenCalledWith({ mood: "warm morning indie", limit: 3 });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(next.json().track).toEqual(resolvedTrack);
    expect(next.json().decision.say).toContain("Search Result");
    expect(next.json().decision.reason).toContain("Search Result");
    expect(next.json().decision.reason).not.toContain("当前没有真实 provider 输入");
    expect(music.search).toHaveBeenCalledWith("warm morning indie");
    expect(music.resolve).toHaveBeenCalledWith(candidateTrack);
  });

  it("uses custom playlist seeds for music search when playlists are injected", async () => {
    const queueTrack = {
      id: "custom-queue-001",
      title: "Custom Queue",
      artist: "Custom Artist",
      album: "Custom Album",
      durationMs: 180000,
      source: "netease" as const
    };
    const candidateTrack = {
      id: "custom-search-001",
      title: "Custom Search",
      artist: "Custom Artist",
      album: "Custom Album",
      durationMs: 210000,
      source: "netease" as const
    };
    const resolvedTrack = {
      ...candidateTrack,
      audioUrl: "https://example.com/audio/custom-search-001.mp3"
    };
    const music = {
      recommend: vi.fn().mockResolvedValue([queueTrack]),
      search: vi.fn().mockResolvedValue([candidateTrack]),
      resolve: vi.fn().mockResolvedValue(resolvedTrack)
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 8, 0, 0),
      ttsAdapter: createMockTtsAdapter(),
      userPreferences: {
        taste: "test taste",
        routines: "test routines",
        moodRules: "test mood",
        playlists: [
          {
            id: "custom-morning",
            name: "Custom Morning",
            description: "A custom morning playlist.",
            seeds: ["custom morning seed"]
          }
        ]
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(music.recommend).toHaveBeenCalledWith({ mood: "custom morning seed", limit: 3 });
  });

  it("selects a different search candidate after the current track has played", async () => {
    const firstTrack = {
      id: "netease-search-001",
      title: "First Result",
      artist: "Adapter Artist",
      album: "Adapter Album",
      durationMs: 210000,
      source: "netease" as const
    };
    const secondTrack = {
      id: "netease-search-002",
      title: "Second Result",
      artist: "Adapter Artist",
      album: "Adapter Album",
      durationMs: 220000,
      source: "netease" as const
    };
    const music = {
      recommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([firstTrack, secondTrack]),
      resolve: vi.fn().mockImplementation(async (track) => ({
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      }))
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 8, 0, 0),
      ttsAdapter: createMockTtsAdapter()
    });

    const first = await app.inject({ method: "GET", url: "/api/next" });
    const second = await app.inject({ method: "GET", url: "/api/next" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().track.id).toBe("netease-search-001");
    expect(second.json().track.id).toBe("netease-search-002");
  });

  it("falls back to mock TTS when real TTS fails for /api/next", async () => {
    const failingTts = {
      async synthesize() {
        throw new Error("TTS service down");
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: failingTts
    });

    const response = await app.inject({ method: "GET", url: "/api/next" });

    expect(response.statusCode).toBe(200);
    expect(response.json().tts.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.mp3$/);
  });

  it("falls back to mock track when search and queue are empty", async () => {
    const music = {
      recommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockRejectedValue(new Error("should not be called"))
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 8, 0, 0),
      ttsAdapter: createMockTtsAdapter()
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });

    expect(next.statusCode).toBe(200);
    expect(next.json().track.source).toBe("mock");
    expect(music.search).toHaveBeenCalledWith("warm morning indie");
    expect(music.resolve).not.toHaveBeenCalled();
  });

  it("shows daypart continuity through queue mood and recent play memory", async () => {
    const firstTrack = {
      id: "netease-track-001",
      title: "Night Window",
      artist: "Signal Room",
      album: "Late Focus",
      durationMs: 180000,
      source: "netease" as const
    };
    const secondTrack = {
      id: "netease-track-002",
      title: "Afterglow Desk",
      artist: "Signal Room",
      album: "Late Focus",
      durationMs: 190000,
      source: "netease" as const
    };
    const music = {
      recommend: vi.fn().mockResolvedValue([firstTrack]),
      search: vi.fn().mockResolvedValueOnce([firstTrack]).mockResolvedValueOnce([secondTrack]),
      resolve: vi.fn().mockImplementation(async (track) => ({
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      }))
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 21, 30, 0),
      ttsAdapter: createMockTtsAdapter()
    });

    await app.inject({ method: "GET", url: "/api/next" });
    const secondNext = await app.inject({ method: "GET", url: "/api/next" });

    expect(music.recommend).toHaveBeenCalledWith({ mood: "ambient pop night", limit: 3 });
    expect(secondNext.statusCode).toBe(200);
    expect(secondNext.json().decision.reason).toContain("Night Window");
    expect(secondNext.json().decision.say).toContain("Afterglow Desk");
  });

  it("produces rain-aware DJ decision when weather contains rain", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      weatherAdapter: {
        async current() {
          return { summary: "大雨，适合窝在室内", moodHint: "rainy", temperatureC: 18 };
        }
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    const body = next.json();
    expect(body.decision.say).toContain("雨");
    expect(body.decision.play.query).toBe("cozy indoor acoustic");
  });

  it("produces empty-calendar DJ decision when calendar is empty", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      calendarAdapter: {
        async upcoming() {
          return [];
        }
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    const body = next.json();
    expect(body.decision.say).toContain("日程很空");
    expect(body.decision.play.query).toBe("chill ambient focus");
  });

  it("produces no-device DJ decision when no playback devices are available", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      deviceAdapter: {
        async list() {
          return [];
        }
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    const body = next.json();
    expect(body.decision.say).toContain("设备");
    expect(body.decision.play.query).toBe("soft background instrumental");
  });

  it("returns a complete radio episode from /api/episode/next", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode).toBeDefined();
    expect(body.episode.track.id).toBe("mock-track-001");
    expect(body.episode.story.text).toBeTruthy();
    expect(body.episode.story.audioUrl).toBeTruthy();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources).toHaveLength(1);
    expect(body.episode.sources[0].kind).toBe("mock");
    expect(body.episode.playback.crossfadeStartOffsetMs).toBeGreaterThanOrEqual(0);
    expect(body.episode.playback.musicStartVolume).toBeGreaterThanOrEqual(0);
    expect(body.episode.playback.musicStartVolume).toBeLessThanOrEqual(1);
  });

  it("returns background story type when metadata source is available with high confidence", async () => {
    const metadataStorySource = {
      async gather() {
        return [
          {
            kind: "metadata" as const,
            title: "Test Song - Test Artist",
            content: "Album: Test Album\nReleased: 2023-06-15",
            url: "https://musicbrainz.org/recording/abc123",
            confidence: 0.95
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: metadataStorySource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("background");
    expect(body.episode.sources).toHaveLength(1);
    expect(body.episode.sources[0].kind).toBe("metadata");
    expect(body.episode.sources[0].confidence).toBe(0.95);
  });

  it("returns lyric-theme story type when only lyric source is available", async () => {
    const lyricStorySource = {
      async gather() {
        return [
          {
            kind: "lyric" as const,
            title: "Test Song",
            content: "第一行歌词\n第二行歌词"
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: lyricStorySource,
      webResearchAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("lyric-theme");
    expect(body.episode.sources).toHaveLength(2);
    expect(body.episode.sources[0].kind).toBe("lyric");
  });

  it("returns mood-reading story type when metadata confidence is below 0.5", async () => {
    const lowConfidenceMetadataSource = {
      async gather() {
        return [
          {
            kind: "metadata" as const,
            title: "Test Song - Test Artist",
            content: "Album: Test Album",
            confidence: 0.3
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: lowConfidenceMetadataSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources[0].kind).toBe("metadata");
    expect(body.episode.sources[0].confidence).toBe(0.3);
  });

  it("returns background story type when both lyric and metadata sources are present", async () => {
    const lyricSource = {
      async gather() {
        return [
          {
            kind: "lyric" as const,
            title: "Test Song",
            content: "第一行歌词"
          }
        ];
      }
    };
    const metadataSource = {
      async gather() {
        return [
          {
            kind: "metadata" as const,
            title: "Test Song - Test Artist",
            content: "Album: Test Album",
            confidence: 0.85
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: lyricSource,
      webResearchAdapter: { async gather() { return []; } },
      publicMetadataAdapter: metadataSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("background");
    expect(body.episode.sources).toHaveLength(2);
  });

  it("returns background story type when web source is available with high confidence", async () => {
    const webSource = {
      async gather() {
        return [
          {
            kind: "web" as const,
            title: "Test Song Meaning",
            content: "A description of the song meaning from the web",
            url: "https://example.com/song-meaning",
            confidence: 0.6
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: { async gather() { return []; } },
      webResearchAdapter: webSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("background");
    expect(body.episode.sources).toHaveLength(1);
    expect(body.episode.sources[0].kind).toBe("web");
    expect(body.episode.sources[0].confidence).toBe(0.6);
  });

  it("returns mood-reading when web source confidence is below 0.5", async () => {
    const lowConfidenceWebSource = {
      async gather() {
        return [
          {
            kind: "web" as const,
            title: "Test Song",
            content: "Low confidence result",
            url: "https://example.com/low-conf",
            confidence: 0.3
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: { async gather() { return []; } },
      webResearchAdapter: lowConfidenceWebSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources).toHaveLength(1);
    expect(body.episode.sources[0].kind).toBe("web");
    expect(body.episode.sources[0].confidence).toBe(0.3);
  });

  it("returns background when both web and metadata sources are available", async () => {
    const metadataSource = {
      async gather() {
        return [
          {
            kind: "metadata" as const,
            title: "Test Song - Test Artist",
            content: "Album: Test Album",
            confidence: 0.85
          }
        ];
      }
    };
    const webSource = {
      async gather() {
        return [
          {
            kind: "web" as const,
            title: "Test Song Meaning",
            content: "A description of the song meaning from the web",
            url: "https://example.com/song-meaning",
            confidence: 0.6
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: metadataSource,
      webResearchAdapter: webSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("background");
    expect(body.episode.sources).toHaveLength(2);
  });

  it("returns mood-reading when metadata adapter fails", async () => {
    const failingMetadataSource = {
      async gather() {
        throw new Error("Metadata service down");
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: failingMetadataSource
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources[0].kind).toBe("mock");
  });

  it("falls back to mock TTS when real TTS fails for episode", async () => {
    const failingTts = {
      async synthesize() {
        throw new Error("TTS service down");
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: failingTts,
      webResearchAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.mp3$/);
    expect(body.episode.fallbackReason).toContain("TTS");
  });

  it("returns lyric-theme story type when lyric source is available", async () => {
    const lyricStorySource = {
      async gather() {
        return [
          {
            kind: "lyric" as const,
            title: "Test Song",
            content: "第一行歌词\n第二行歌词"
          }
        ];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: lyricStorySource,
      webResearchAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("lyric-theme");
    expect(body.episode.sources).toHaveLength(2);
    expect(body.episode.sources[0].kind).toBe("lyric");
  });

  it("returns mood-reading story type when lyric source is unavailable", async () => {
    const emptyStorySource = {
      async gather() {
        return [];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: emptyStorySource,
      webResearchAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources[0].kind).toBe("mock");
  });

  it("returns mood-reading story type when story source throws", async () => {
    const failingStorySource = {
      async gather() {
        throw new Error("Lyric service down");
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: failingStorySource,
      webResearchAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.type).toBe("mood-reading");
    expect(body.episode.sources[0].kind).toBe("mock");
  });
  it("reports story source provider status in health", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().adapters.storySource).toBe("ready");
  });

  it("reports webResearch status in health", async () => {
    const webResearchAdapter = {
      async gather() {
        return [];
      }
    };

    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter(),
      webResearchAdapter
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().adapters.webResearch).toBe("ready");
  });


  it("uses injected user preferences for DJ decisions", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      userPreferences: {
        taste: "Custom taste: no vocals, ambient only.",
        routines: "Custom routines: night owl schedule.",
        moodRules: "Custom mood: dark and rainy.",
        playlists: [
          {
            id: "test-playlist",
            name: "Test Playlist",
            description: "For testing.",
            seeds: ["test seed"]
          }
        ]
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(next.json().decision.say).toBeTruthy();
  });

  it("exposes loaded user preferences via /api/taste", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      userPreferences: {
        taste: "Test taste content",
        routines: "Test routines content",
        moodRules: "Test mood rules content",
        playlists: [
          {
            id: "test-playlist",
            name: "Test Playlist",
            description: "For testing.",
            seeds: ["test seed"]
          }
        ]
      }
    });

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    expect(taste.json().taste).toBe("Test taste content");
    expect(taste.json().routines).toBe("Test routines content");
    expect(taste.json().moodRules).toBe("Test mood rules content");
    expect(taste.json().playlists[0].id).toBe("test-playlist");
  });

  it("returns loaded playlists from /api/taste", async () => {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      userPreferences: {
        taste: "Test taste",
        routines: "Test routines",
        moodRules: "Test mood",
        playlists: [
          {
            id: "morning-soft-start",
            name: "早晨轻启动",
            description: "温暖、低刺激、适合开始一天。",
            seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
          },
          {
            id: "focus-coding",
            name: "写代码专注",
            description: "稳定节奏、少人声、适合持续工作。",
            seeds: ["instrumental focus", "minimal electronic", "lofi coding"]
          },
          {
            id: "night-downshift",
            name: "晚间降速",
            description: "低密度、空间感、适合收尾。",
            seeds: ["ambient pop night", "soft piano electronic", "dreamy downtempo"]
          }
        ]
      }
    });

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    const body = taste.json();
    expect(body.playlists).toHaveLength(3);
    expect(body.playlists[0].id).toBe("morning-soft-start");
    expect(body.playlists[1].id).toBe("focus-coding");
    expect(body.playlists[2].id).toBe("night-downshift");
    expect(body.playlists[2].seeds).toContain("ambient pop night");
  });

  it("uses seeds from loaded playlists for /api/next", async () => {
    const music = {
      recommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([
        {
          id: "netease-search-001",
          title: "Search Result",
          artist: "Adapter Artist",
          album: "Adapter Album",
          durationMs: 210000,
          source: "netease" as const
        }
      ]),
      resolve: vi.fn().mockImplementation(async (track) => ({
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      }))
    };

    app = await createRadioServer({
      musicAdapterResult: {
        music,
        status: "ready"
      },
      now: () => new Date(2026, 3, 30, 8, 0, 0),
      ttsAdapter: createMockTtsAdapter(),
      userPreferences: {
        taste: "Test taste",
        routines: "Test routines",
        moodRules: "Test mood",
        playlists: [
          {
            id: "morning-soft-start",
            name: "早晨轻启动",
            description: "温暖、低刺激、适合开始一天。",
            seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
          }
        ]
      }
    });

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(music.search).toHaveBeenCalledWith("warm morning indie");
    expect(next.json().track.title).toBe("Search Result");
  });
});

import { mkdtempSync, writeFileSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("TTS cache route", () => {
  let tempDir: string;
  let ttsApp: FastifyInstance | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tts-cache-route-test-"));
  });

  afterEach(async () => {
    await ttsApp?.close();
    ttsApp = undefined;
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch {}
  });

  it("serves valid cached audio files", async () => {
    writeFileSync(`${tempDir}/abc123.mp3`, Buffer.from("fake audio"));

    ttsApp = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      ttsCacheDir: tempDir
    });

    const response = await ttsApp.inject({ method: "GET", url: "/cache/tts/abc123.mp3" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
  });

  it("rejects sibling directory prefix bypass", async () => {
    const siblingDir = mkdtempSync(join(tmpdir(), "tts-cache-sibling-"));
    writeFileSync(`${siblingDir}/secret.mp3`, Buffer.from("secret audio"));

    ttsApp = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      ttsCacheDir: tempDir
    });

    const response = await ttsApp.inject({ method: "GET", url: `/cache/tts/${siblingDir}/secret.mp3` });

    expect(response.statusCode).toBe(404);

    try {
      rmdirSync(siblingDir, { recursive: true });
    } catch {}
  });

  it("rejects absolute path outside cache dir", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "tts-cache-outside-"));
    writeFileSync(`${outsideDir}/outside.mp3`, Buffer.from("outside audio"));

    ttsApp = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      ttsCacheDir: tempDir
    });

    const response = await ttsApp.inject({ method: "GET", url: `/cache/tts/${outsideDir}/outside.mp3` });

    expect(response.statusCode).toBe(404);

    try {
      rmdirSync(outsideDir, { recursive: true });
    } catch {}
  });
});
