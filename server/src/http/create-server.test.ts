import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockMusicAdapter, createMockTtsAdapter } from "../adapters/index.js";
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
