import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockMusicAdapter, createMockStorySourceAdapter, createMockTtsAdapter } from "../adapters/index.js";
import { createRadioServer } from "./create-server.js";
import { createStateRepository } from "../state/state-repository.js";

let app: FastifyInstance | undefined;
let isolatedBaseDirs: string[] = [];

function createMockMusicAdapterResult() {
  return {
    music: createMockMusicAdapter(),
    status: "mock" as const
  };
}

function createEmptyLikedSongsBaseDir() {
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-server-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
  isolatedBaseDirs.push(dir);
  return dir;
}

function createTestRadioServer(options: Parameters<typeof createRadioServer>[0] = {}) {
  return createRadioServer({
    ...options,
    baseDir: options.baseDir ?? createEmptyLikedSongsBaseDir()
  });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of isolatedBaseDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  isolatedBaseDirs = [];
});

describe("createRadioServer", () => {
  it("serves health, now, plan, next, taste, and chat contracts", async () => {
    app = await createTestRadioServer({
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
    expect(plan.json().blocks).toHaveLength(6);

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    expect(taste.json().playlists[0].id).toBe("midnight-quiet");

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

  it("serves prewarm status with blocks from today's plan", async () => {
    const baseDir = createEmptyLikedSongsBaseDir();
    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    await repo.savePreparedEpisode({ radioDate: "2026-04-30", blockAt: "07:00", status: "ready" });
    await repo.savePreparedEpisode({ radioDate: "2026-04-30", blockAt: "09:00", status: "failed", error: "no track" });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    const response = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.enabled).toBeTypeOf("boolean");
    expect(body.targetDate).toBeTypeOf("string");
    expect(body.blocks).toBeInstanceOf(Array);
    expect(body.blocks.length).toBeGreaterThan(0);
    expect(body.blocks[0]).toMatchObject({
      at: expect.any(String),
      label: expect.any(String),
      ready: expect.any(Number),
      consumed: expect.any(Number),
      failed: expect.any(Number)
    });
    expect(body.blocks.find((block: { at: string }) => block.at === "07:00")).toMatchObject({ ready: 1, consumed: 0, failed: 0 });
    expect(body.blocks.find((block: { at: string }) => block.at === "09:00")).toMatchObject({ ready: 0, consumed: 0, failed: 1 });
  });

  it("avoids recently persisted played tracks after a server restart", async () => {
    const baseDir = createEmptyLikedSongsBaseDir();
    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    await repo.recordPlayedTrack({
      id: "played-track-1",
      trackId: "mock-track-001",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      album: "Local First Radio",
      source: "mock",
      playedAt: new Date("2026-04-30T00:00:00.000Z").toISOString()
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter(),
      webResearchAdapter: createMockStorySourceAdapter(),
      baseDir
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });

    expect(response.statusCode).toBe(200);
    expect(response.json().episode.track.id).toBe("mock-track-002");
  });

  it("keeps the latest DJ speech in now after computing next", async () => {
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const health = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "http://127.0.0.1:3302"
      }
    });

    expect(health.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3302");
  });

  it("serves Netease login status and QR login endpoints", async () => {
    const neteaseAuth = {
      getStatus: vi.fn().mockResolvedValue({
        loggedIn: true,
        cookieStored: true,
        nickname: "FakeRadio Listener",
        userId: 1001
      }),
      createQrLogin: vi.fn().mockResolvedValue({
        key: "qr-key-1",
        qrImageUrl: "data:image/png;base64,abc",
        qrUrl: "https://music.163.com/login?code=1"
      }),
      checkQrLogin: vi.fn().mockResolvedValue({
        code: 803,
        message: "授权登录成功",
        loggedIn: true,
        cookieSaved: true
      }),
      logout: vi.fn().mockResolvedValue({
        loggedIn: false,
        cookieStored: false
      })
    };

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      neteaseAuthService: neteaseAuth
    });

    const status = await app.inject({ method: "GET", url: "/api/netease/login/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      loggedIn: true,
      cookieStored: true,
      nickname: "FakeRadio Listener"
    });

    const qr = await app.inject({ method: "POST", url: "/api/netease/login/qr" });
    expect(qr.statusCode).toBe(200);
    expect(qr.json()).toMatchObject({
      key: "qr-key-1",
      qrImageUrl: "data:image/png;base64,abc"
    });

    const check = await app.inject({ method: "GET", url: "/api/netease/login/qr/qr-key-1" });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      code: 803,
      loggedIn: true,
      cookieSaved: true
    });
    expect(neteaseAuth.checkQrLogin).toHaveBeenCalledWith("qr-key-1");
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: failingTts
    });

    const response = await app.inject({ method: "GET", url: "/api/next" });

    expect(response.statusCode).toBe(200);
    expect(response.json().tts.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.wav$/);
  });

  it("falls back to mock track when search and queue are empty", async () => {
    const music = {
      recommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockRejectedValue(new Error("should not be called"))
    };

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: failingTts,
      webResearchAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.story.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.wav$/);
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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
    app = await createTestRadioServer({
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

    app = await createTestRadioServer({
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

  it("returns a prepared episode from /api/episode/next when one exists for the current block", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prepared-episode-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const preparedEpisode = {
      track: { id: "prepared-001", title: "Prepared Track", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/prepared-001.mp3" },
      story: { text: "Prepared story.", audioUrl: "http://localhost/tts/prepared.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "07:00",
      status: "ready",
      episodeJson: JSON.stringify(preparedEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.track.id).toBe("prepared-001");
    expect(body.episode.track.title).toBe("Prepared Track");
    expect(body.episode.story.text).toBe("Prepared story.");
    expect(body.source).toBe("prepared");
  });

  it("skips a prepared episode when its track was recently played", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prepared-episode-recent-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const recentEpisode = {
      track: { id: "prepared-recent", title: "Prepared Recent", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/prepared-recent.mp3" },
      story: { text: "Recent prepared story.", audioUrl: "http://localhost/tts/recent.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    const freshEpisode = {
      track: { id: "prepared-fresh", title: "Prepared Fresh", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/prepared-fresh.mp3" },
      story: { text: "Fresh prepared story.", audioUrl: "http://localhost/tts/fresh.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.recordPlayedTrack({
      id: "played-prepared-recent",
      trackId: "prepared-recent",
      title: "Prepared Recent",
      artist: "Prepared Artist",
      album: null,
      source: "mock",
      playedAt: "2026-04-30T03:30:00.000Z"
    });
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "12:00",
      status: "ready",
      episodeJson: JSON.stringify(recentEpisode),
      audioDownloaded: true
    });
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "12:00",
      status: "ready",
      episodeJson: JSON.stringify(freshEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 12, 30, 0)
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.track.id).toBe("prepared-fresh");
    expect(body.source).toBe("prepared");
  });

  it("falls back to live generation when no prepared episode exists for the current block", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: createMockStorySourceAdapter(),
      publicMetadataAdapter: createMockStorySourceAdapter(),
      webResearchAdapter: createMockStorySourceAdapter(),
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    const response = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.episode.track.id).toBe("mock-track-001");
    expect(body.source).toBe("live");
  });

  it("does not reuse a consumed prepared episode on subsequent /api/episode/next calls", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prepared-episode-consumed-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const preparedEpisode = {
      track: { id: "prepared-002", title: "Prepared Track 2", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/prepared-002.mp3" },
      story: { text: "Prepared story 2.", audioUrl: "http://localhost/tts/prepared2.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "07:00",
      status: "ready",
      episodeJson: JSON.stringify(preparedEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    const first = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(first.statusCode).toBe(200);
    expect(first.json().episode.track.id).toBe("prepared-002");

    const second = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(second.statusCode).toBe(200);
    expect(second.json().episode.track.id).toBe("mock-track-001");
  });

  it("chat next-track intent does not consume prepared episodes", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prewarm-chat-next-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const preparedEpisode = {
      track: { id: "chat-prepared-001", title: "Chat Prepared Track", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/chat-prepared-001.mp3" },
      story: { text: "Chat prepared story.", audioUrl: "http://localhost/tts/chat-prepared.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "07:00",
      status: "ready",
      episodeJson: JSON.stringify(preparedEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    // Verify initial prewarm status shows 1 ready
    const statusBefore = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(statusBefore.json().blocks.find((b: { at: string }) => b.at === "07:00").ready).toBe(1);

    // Send a next-track chat message
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "下一首" }
    });
    expect(chat.statusCode).toBe(200);

    // Verify prewarm status still shows 1 ready — pool NOT consumed
    const statusAfter = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(statusAfter.json().blocks.find((b: { at: string }) => b.at === "07:00").ready).toBe(1);

    // Verify next /api/episode/next still returns the prepared episode
    const nextEp = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(nextEp.statusCode).toBe(200);
    expect(nextEp.json().episode.track.id).toBe("chat-prepared-001");
  });

  it("chat story-background intent does not consume prepared episodes", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prewarm-chat-story-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const preparedEpisode = {
      track: { id: "story-prepared-001", title: "Story Prepared Track", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/story-prepared-001.mp3" },
      story: { text: "Story prepared story.", audioUrl: "http://localhost/tts/story-prepared.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "07:00",
      status: "ready",
      episodeJson: JSON.stringify(preparedEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    // Trigger a track first so story intent has a current track
    await app.inject({ method: "GET", url: "/api/episode/next" });

    // Chat story intent
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "讲个故事" }
    });
    expect(chat.statusCode).toBe(200);

    // Prepared pool unchanged
    const statusAfter = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(statusAfter.json().blocks.find((b: { at: string }) => b.at === "07:00").ready).toBe(0); // consumed by the first /api/episode/next call
    expect(statusAfter.json().blocks.find((b: { at: string }) => b.at === "07:00").consumed).toBe(1);

    // next-track chat did not consume pool (it went through live path, not /api/episode/next)
  });

  it("default chat intent does not consume prepared episodes", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prewarm-chat-default-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    const preparedEpisode = {
      track: { id: "default-prepared-001", title: "Default Prepared Track", artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/default-prepared-001.mp3" },
      story: { text: "Default prepared story.", audioUrl: "http://localhost/tts/default-prepared.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-04-30",
      blockAt: "07:00",
      status: "ready",
      episodeJson: JSON.stringify(preparedEpisode),
      audioDownloaded: true
    });

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    const statusBefore = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(statusBefore.json().blocks.find((b: { at: string }) => b.at === "07:00").ready).toBe(1);

    // Default LLM chat
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "今天天气怎么样" }
    });
    expect(chat.statusCode).toBe(200);

    // Prepared pool still 1
    const statusAfter = await app.inject({ method: "GET", url: "/api/prewarm/status" });
    expect(statusAfter.json().blocks.find((b: { at: string }) => b.at === "07:00").ready).toBe(1);

    // But next /api/episode/next still returns prepared episode
    const nextEp = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(nextEp.json().episode.track.id).toBe("default-prepared-001");
  });

  it("returns to prepared pool after a chat insertion (prepared pool survives live insertion)", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "prewarm-chat-return-test-"));
    isolatedBaseDirs.push(baseDir);
    mkdirSync(join(baseDir, "user"), { recursive: true });
    writeFileSync(join(baseDir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");

    const repo = createStateRepository(join(baseDir, "fakeradio.db"));
    // Two prepared episodes for the block
    for (let i = 1; i <= 2; i++) {
      await repo.savePreparedEpisode({
        radioDate: "2026-04-30",
        blockAt: "07:00",
        status: "ready",
        episodeJson: JSON.stringify({
          track: { id: `return-prepared-${i}`, title: `Return Prepared ${i}`, artist: "Prepared Artist", durationMs: 180000, source: "mock" as const, audioUrl: `http://localhost/audio/return-prepared-${i}.mp3` },
          story: { text: `Return story ${i}.`, audioUrl: `http://localhost/tts/return-${i}.wav`, type: "mood-reading" as const },
          sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
          playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
        }),
        audioDownloaded: true
      });
    }

    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir,
      now: () => new Date(2026, 3, 30, 8, 0, 0)
    });

    // First /api/episode/next consumes first prepared
    const first = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(first.json().episode.track.id).toBe("return-prepared-1");

    // Chat insertion (live)
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "换一首" }
    });
    expect(chat.statusCode).toBe(200);

    // Second /api/episode/next should still return prepared (not the second consumed one)
    // After first consumed (1 left), chat didn't touch pool, so still 1 left
    const second = await app.inject({ method: "GET", url: "/api/episode/next" });
    expect(second.json().episode.track.id).toBe("return-prepared-2");
  });
});

describe("Liked songs diagnostics endpoint", () => {
  let tempDir: string;
  let diagApp: FastifyInstance | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "liked-songs-diag-test-"));
  });

  afterEach(async () => {
    await diagApp?.close();
    diagApp = undefined;
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch {}
  });

  it("returns diagnostics with loaded=false when file is missing", async () => {
    diagApp = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir: tempDir
    });

    const response = await diagApp.inject({ method: "GET", url: "/api/favorites/diagnostics" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      loaded: false,
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
      samples: []
    });
  });

  it("returns diagnostics with loaded=true and valid count for populated file", async () => {
    const userDir = join(tempDir, "user");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(
      join(userDir, "netease-liked-songs.raw.json"),
      JSON.stringify([
        {
          id: 1,
          name: "Test Song",
          ar: [{ name: "Test Artist" }],
          al: { name: "Test Album", picUrl: "https://example.com/pic.jpg" }
        }
      ]),
      "utf-8"
    );

    diagApp = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir: tempDir
    });

    const response = await diagApp.inject({ method: "GET", url: "/api/favorites/diagnostics" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      loaded: true,
      totalCount: 1,
      validCount: 1,
      invalidCount: 0,
      samples: [{ id: "1", title: "Test Song", artist: "Test Artist", album: "Test Album" }]
    });
  });

  it("limits samples to max 3 even with more songs", async () => {
    const userDir = join(tempDir, "user");
    mkdirSync(userDir, { recursive: true });
    const songs = [
      { id: 1, name: "Song 1", ar: [{ name: "Artist 1" }], al: { name: "Album 1" } },
      { id: 2, name: "Song 2", ar: [{ name: "Artist 2" }], al: { name: "Album 2" } },
      { id: 3, name: "Song 3", ar: [{ name: "Artist 3" }], al: { name: "Album 3" } },
      { id: 4, name: "Song 4", ar: [{ name: "Artist 4" }], al: { name: "Album 4" } }
    ];
    writeFileSync(join(userDir, "netease-liked-songs.raw.json"), JSON.stringify(songs), "utf-8");

    diagApp = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      baseDir: tempDir
    });

    const response = await diagApp.inject({ method: "GET", url: "/api/favorites/diagnostics" });
    expect(response.statusCode).toBe(200);
    expect(response.json().totalCount).toBe(4);
    expect(response.json().samples).toHaveLength(3);
  });
});

describe("TTS cache route", () => {
  let tempDir: string;
  let ttsApp: FastifyInstance | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tts-cache-route-test-"));
  });

  afterEach(async () => {
    await ttsApp?.close();
    ttsApp = undefined;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves valid cached audio files", async () => {
    writeFileSync(`${tempDir}/abc123.mp3`, Buffer.from("fake audio"));

    ttsApp = await createTestRadioServer({
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

    ttsApp = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      ttsCacheDir: tempDir
    });

    const response = await ttsApp.inject({ method: "GET", url: `/cache/tts/${siblingDir}/secret.mp3` });

    expect(response.statusCode).toBe(404);

    rmSync(siblingDir, { recursive: true, force: true });
  });

  it("rejects absolute path outside cache dir", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "tts-cache-outside-"));
    writeFileSync(`${outsideDir}/outside.mp3`, Buffer.from("outside audio"));

    ttsApp = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      ttsCacheDir: tempDir
    });

    const response = await ttsApp.inject({ method: "GET", url: `/cache/tts/${outsideDir}/outside.mp3` });

    expect(response.statusCode).toBe(404);

    rmSync(outsideDir, { recursive: true, force: true });
  });
});

describe("ProgramBrief intent parsing", () => {
  it("creates a theme-show brief when user says '帮我做一期 Bee Gees 主题节目'", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Bee Gees 主题节目" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toContain("Bee Gees");
    expect(body.brief).toBeDefined();
    expect(body.brief.type).toBe("theme-show");
    expect(body.brief.topic).toBe("Bee Gees");
    expect(body.brief.status).toBe("draft");
  });

  it("creates a block-theme brief when user says '今晚想听 Bee Gees'", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      now: () => new Date(2026, 4, 12, 10, 0, 0)
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "今晚想听 Bee Gees" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.brief).toBeDefined();
    expect(body.brief.type).toBe("block-theme");
    expect(body.brief.topic).toBe("Bee Gees");
    expect(body.brief.scope).toBe("block");
  });

  it("does not create brief for weak expression like '我喜欢 Bee Gees'", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "我喜欢 Bee Gees" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.brief).toBeUndefined();
  });

  it("does not create brief for casual chat", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "今天天气怎么样" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.brief).toBeUndefined();
  });

  it("lists briefs via GET /api/briefs", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 ABBA 主题节目" }
    });
    expect(createResponse.statusCode).toBe(200);

    const response = await app.inject({ method: "GET", url: "/api/briefs" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.briefs).toBeInstanceOf(Array);
    expect(body.briefs.length).toBeGreaterThan(0);
    expect(body.briefs.some((b: { topic: string }) => b.topic === "ABBA")).toBe(true);
  });

  it("gets brief by id via GET /api/briefs/:id", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Queen 主题节目" }
    });

    const briefId = createResponse.json().brief.id;

    const response = await app.inject({ method: "GET", url: `/api/briefs/${briefId}` });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.brief).toBeDefined();
    expect(body.brief.topic).toBe("Queen");
  });

  describe("ShowPlan API", () => {
    it("lists all plans via GET /api/plans", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const response = await app.inject({ method: "GET", url: "/api/plans" });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.plans).toBeInstanceOf(Array);
    });

    it("gets plans by briefId via GET /api/plans/:briefId", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Beatles 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);

      const briefId = createResponse.json().brief.id;

      const response = await app.inject({ method: "GET", url: `/api/plans/${briefId}` });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.plans).toBeInstanceOf(Array);
      expect(body.plans.length).toBeGreaterThan(0);
      expect(body.plans[0].briefId).toBe(briefId);
    });

    it("gets active plan by briefId via GET /api/plans/:briefId/active", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Rolling Stones 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);

      const briefId = createResponse.json().brief.id;

      const response = await app.inject({ method: "GET", url: `/api/plans/${briefId}/active` });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.plan).toBeDefined();
      expect(body.plan.briefId).toBe(briefId);
      expect(body.plan.active).toBe(true);
      expect(body.plan.blocks.length).toBeGreaterThanOrEqual(4);
      expect(body.plan.blocks.length).toBeLessThanOrEqual(8);
    });

    it("returns 404 when no active plan exists for briefId", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const response = await app.inject({ method: "GET", url: "/api/plans/non-existent-brief-id/active" });
      expect(response.statusCode).toBe(404);
    });

    it("integration: brief creation → plan generation → plan retrieval", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Pink Floyd 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);

      const brief = createResponse.json().brief;
      expect(brief).toBeDefined();
      expect(brief.topic).toBe("Pink Floyd");

      const plansResponse = await app.inject({ method: "GET", url: `/api/plans/${brief.id}` });
      expect(plansResponse.statusCode).toBe(200);

      const plans = plansResponse.json().plans;
      expect(plans.length).toBeGreaterThan(0);
      expect(plans[0].briefId).toBe(brief.id);
      expect(plans[0].active).toBe(true);
      expect(plans[0].blocks[0].role).toBe("opening");
      expect(plans[0].blocks[plans[0].blocks.length - 1].role).toBe("closing");

      const activeResponse = await app.inject({ method: "GET", url: `/api/plans/${brief.id}/active` });
      expect(activeResponse.statusCode).toBe(200);
      expect(activeResponse.json().plan.id).toBe(plans[0].id);
    });
  });

  describe("ShowPlan constraints & versioning", () => {
    it("adds constraints to existing plan and creates new version", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Beatles 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);
      const brief = createResponse.json().brief;

      const activePlanResponse = await app.inject({ method: "GET", url: `/api/plans/${brief.id}/active` });
      expect(activePlanResponse.statusCode).toBe(200);
      const originalPlan = activePlanResponse.json().plan;
      expect(originalPlan.version).toBe(1);

      const addConstraintsResponse = await app.inject({
        method: "POST",
        url: "/api/plans/add-constraints",
        payload: {
          planId: originalPlan.id,
          constraints: {
            preferEra: "1960s",
            moodHint: "nostalgic"
          }
        }
      });
      expect(addConstraintsResponse.statusCode).toBe(200);
      const newPlan = addConstraintsResponse.json().plan;

      expect(newPlan.id).toBe(originalPlan.id);
      expect(newPlan.version).toBe(2);
      expect(newPlan.briefId).toBe(originalPlan.briefId);

      const newActivePlanResponse = await app.inject({ method: "GET", url: `/api/plans/${brief.id}/active` });
      expect(newActivePlanResponse.statusCode).toBe(200);
      expect(newActivePlanResponse.json().plan.id).toBe(newPlan.id);
    });

    it("returns 404 when plan does not exist for add-constraints", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/plans/add-constraints",
        payload: {
          planId: "non-existent-plan-id",
          constraints: { moodHint: "energetic" }
        }
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("Theme Story Show: Generate Now & Schedule Tonight", () => {
    it("generates a project and job for generate-now", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      // First create a brief
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Pink Floyd 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);
      const brief = createResponse.json().brief;
      expect(brief).toBeDefined();

      // Test generate-now
      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      expect(generateResponse.statusCode).toBe(201);
      const { project, job } = generateResponse.json();
      expect(project).toBeDefined();
      expect(job).toBeDefined();
      expect(project.briefId).toBe(brief.id);
      expect(project.status).toBe("ready");
      expect(job.briefId).toBe(brief.id);
      expect(job.status).toBe("completed");

      // Test we can retrieve the project
      const projectResponse = await app.inject({ method: "GET", url: `/api/shows/${project.id}` });
      expect(projectResponse.statusCode).toBe(200);
      expect(projectResponse.json().project.id).toBe(project.id);

      // Test we can list all projects
      const listResponse = await app.inject({ method: "GET", url: "/api/shows" });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().projects.length).toBeGreaterThan(0);
    });

    it("schedules a show for tonight", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      // First create a brief
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Queen 主题节目" }
      });
      const brief = createResponse.json().brief;

      // Test schedule-tonight
      const scheduleResponse = await app.inject({
        method: "POST",
        url: "/api/shows/schedule-tonight",
        payload: { briefId: brief.id }
      });
      expect(scheduleResponse.statusCode).toBe(201);
      const { project, brief: updatedBrief, scheduledAt } = scheduleResponse.json();
      expect(project).toBeDefined();
      expect(updatedBrief).toBeDefined();
      expect(scheduledAt).toBeDefined();
      expect(project.briefId).toBe(brief.id);
      expect(updatedBrief.status).toBe("scheduled");
    });

    it("returns 404 for generate-now with invalid briefId", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: "non-existent-brief-id" }
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for schedule-tonight with invalid briefId", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/shows/schedule-tonight",
        payload: { briefId: "non-existent-brief-id" }
      });
      expect(response.statusCode).toBe(404);
    });

    it("writes prepared episode trace entries to show project on generate-now", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Bee Gees 主题节目" }
      });
      expect(createResponse.statusCode).toBe(200);
      const brief = createResponse.json().brief;
      expect(brief).toBeDefined();

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      expect(generateResponse.statusCode).toBe(201);
      const { project } = generateResponse.json();
      expect(project).toBeDefined();
      expect(project.productionTracePath).toBeDefined();

      const fs = await import("node:fs");
      const traceContent = fs.readFileSync(project.productionTracePath, "utf-8");
      const lines = traceContent.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
    });

    it("writes trace for scheduled show status changes", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter()
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Queen 主题节目" }
      });
      const brief = createResponse.json().brief;

      const scheduleResponse = await app.inject({
        method: "POST",
        url: "/api/shows/schedule-tonight",
        payload: { briefId: brief.id }
      });
      expect(scheduleResponse.statusCode).toBe(201);
      const { project: scheduledProject } = scheduleResponse.json();
      expect(scheduledProject.productionTracePath).toBeDefined();

      const fs = await import("node:fs");
      const traceContent = fs.readFileSync(scheduledProject.productionTracePath, "utf-8");
      const lines = traceContent.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      expect(lastEntry.type).toBe("scheduled");
    });

    it("POST /api/projects/:id/export returns 404 for non-existent project", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter(),
        storySourceAdapter: { async gather() { return []; } },
        publicMetadataAdapter: createMockStorySourceAdapter()
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/projects/nonexistent-id/export",
        payload: { includeTrace: true }
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /api/export/project/:id/download returns 404 for non-existent", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createMockMusicAdapterResult(),
        ttsAdapter: createMockTtsAdapter(),
        storySourceAdapter: { async gather() { return []; } },
        publicMetadataAdapter: createMockStorySourceAdapter()
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/export/project/nonexistent-id/download"
      });

      expect(response.statusCode).toBe(404);
    });

    it("scheduler creates and starts a job when a scheduled brief matches target date", async () => {
      const { scheduleTonightBriefIfNeeded } = await import("../show/scheduler-integration.js");
      const { createProgramBriefRepository } = await import("../show/program-brief-repository.js");
      const { createShowPlanRepository } = await import("../show/show-plan-repository.js");
      const { createJobRegistry } = await import("../show/show-generation-job.js");
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      try {
        const programDir = join(baseDir, "programs");
        const briefRepo = createProgramBriefRepository(programDir);
        const planRepo = createShowPlanRepository(programDir);
        const jobRegistry = createJobRegistry(programDir);

        const now = new Date();
        const targetDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const briefId = "test-brief-scheduler-001";

        await briefRepo.save({
          id: briefId,
          type: "theme-show",
          topic: "Test Scheduler Brief",
          scope: "full-show",
          targetDate,
          priority: "user-requested",
          status: "scheduled",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });

        const briefData = {
          id: briefId,
          type: "theme-show" as const,
          topic: "Test Scheduler Brief",
          scope: "full-show" as const,
          targetDate,
          priority: "user-requested" as const,
          status: "scheduled" as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        const planId = "test-plan-scheduler-001";
        await planRepo.save({
          id: planId,
          version: 1,
          briefId,
          active: true,
          briefSnapshot: briefData,
          title: "Test Show Plan",
          blocks: [{
            role: "opening",
            title: "Opening",
            storyGoal: "Open the test show.",
            selectionGoal: "Select an opening track.",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });

        const jobsBefore = await jobRegistry.list({ briefId });

        await scheduleTonightBriefIfNeeded({
          briefRepo,
          planRepo,
          jobRegistry,
          targetDate
        });

        const jobsAfter = await jobRegistry.list({ briefId });
        expect(jobsAfter.length).toBe(jobsBefore.length + 1);
        const newJob = jobsAfter.find(j => !jobsBefore.map(b => b.id).includes(j.id));
        expect(newJob).toBeDefined();
        expect(newJob!.status).toBe("running");
        expect(newJob!.briefId).toBe(briefId);
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    });

    it("scheduler skips brief when no scheduled briefs match target date", async () => {
      const { scheduleTonightBriefIfNeeded } = await import("../show/scheduler-integration.js");
      const { createProgramBriefRepository } = await import("../show/program-brief-repository.js");
      const { createShowPlanRepository } = await import("../show/show-plan-repository.js");
      const { createJobRegistry } = await import("../show/show-generation-job.js");
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-skip-test-"));
      try {
        const programDir = join(baseDir, "programs");
        const briefRepo = createProgramBriefRepository(programDir);
        const planRepo = createShowPlanRepository(programDir);
        const jobRegistry = createJobRegistry(programDir);

        const targetDate = "2099-12-31";

        await briefRepo.save({
          id: "some-other-brief",
          type: "theme-show",
          targetDate: "1999-01-01",
          priority: "user-requested",
          status: "scheduled",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        const jobsBefore = await jobRegistry.list();

        await scheduleTonightBriefIfNeeded({
          briefRepo,
          planRepo,
          jobRegistry,
          targetDate
        });

        const jobsAfter = await jobRegistry.list();
        expect(jobsAfter.length).toBe(jobsBefore.length);
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    });
  });
});
