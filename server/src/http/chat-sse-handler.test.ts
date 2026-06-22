import { afterEach, describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeLlmAdapter, createFakeMusicAdapter, createFakeStorySourceAdapter, createFakeTtsAdapter } from "../test/fake-adapters.js";
import { createRadioServer } from "./create-server.js";
import { splitIntoSentences } from "./chat-sse-handler.js";

let app: FastifyInstance | undefined;
let isolatedBaseDirs: string[] = [];

function createEmptyLikedSongsBaseDir() {
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-chat-sse-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
  isolatedBaseDirs.push(dir);
  return dir;
}

function createTestRadioServer(tracks?: Parameters<typeof createFakeMusicAdapter>[0]) {
  return createRadioServer({
    baseDir: createEmptyLikedSongsBaseDir(),
    llmAdapter: createFakeLlmAdapter(),
    musicAdapterResult: { music: createFakeMusicAdapter(tracks), status: "ready" },
    ttsAdapter: createFakeTtsAdapter(),
    storySourceAdapter: createFakeStorySourceAdapter(),
    publicMetadataAdapter: createFakeStorySourceAdapter(),
    webResearchAdapter: createFakeStorySourceAdapter(),
    now: () => new Date(2026, 5, 3, 14, 0, 0)
  });
}

function parseSseDone(payload: string) {
  const doneLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: ") && line.includes("show-brief-created"));
  if (!doneLine) return null;
  return JSON.parse(doneLine.slice("data: ".length)) as {
    text: string;
    action?: { type: string; briefId?: string };
  };
}

function parseLastSseDone(payload: string) {
  const doneLine = payload
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .reverse()
    .find((line) => line.includes("\"text\""));
  if (!doneLine) return null;
  return JSON.parse(doneLine.slice("data: ".length)) as {
    text: string;
    action?: { type: string; trackId?: string; title?: string; artist?: string };
  };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of isolatedBaseDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  isolatedBaseDirs = [];
});

describe("splitIntoSentences", () => {
  it("splits Chinese sentences by 。！？", () => {
    const result = splitIntoSentences("夜里好。这首《夜车》是陈粒的，留给还没睡的人。");
    expect(result).toEqual([
      "夜里好。",
      "这首《夜车》是陈粒的，留给还没睡的人。",
    ]);
  });

  it("splits English sentences by . ! ?", () => {
    const result = splitIntoSentences("Hello world. How are you? I'm fine!");
    expect(result).toEqual([
      "Hello world.",
      "How are you?",
      "I'm fine!",
    ]);
  });

  it("handles mixed Chinese and English", () => {
    const result = splitIntoSentences("Hi！你好吗？I'm fine.");
    expect(result).toEqual([
      "Hi！",
      "你好吗？",
      "I'm fine.",
    ]);
  });

  it("returns empty array for empty string", () => {
    const result = splitIntoSentences("");
    expect(result).toEqual([]);
  });

  it("handles text without sentence endings", () => {
    const result = splitIntoSentences("这是一句没有结束的话");
    expect(result).toEqual(["这是一句没有结束的话"]);
  });
});

describe("ChatSSEHandler intent routing", () => {
  it("POST /api/chat/stream creates a persisted brief and active plan for explicit show requests", async () => {
    app = await createTestRadioServer();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat/stream",
      payload: { message: "帮我做一期后摇主题节目" }
    });

    expect(response.statusCode).toBe(200);
    const done = parseSseDone(response.payload);
    expect(done?.action).toMatchObject({
      type: "show-brief-created",
      briefId: expect.any(String)
    });

    const briefsResponse = await app.inject({ method: "GET", url: "/api/briefs" });
    const briefs = briefsResponse.json().briefs;
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toMatchObject({
      id: done?.action?.briefId,
      topic: "后摇",
      type: "theme-show"
    });

    const planResponse = await app.inject({
      method: "GET",
      url: `/api/plans/${done?.action?.briefId}/active`
    });
    expect(planResponse.statusCode).toBe(200);
    expect(planResponse.json().plan.blocks.length).toBeGreaterThan(0);
  });

  it("POST /api/chat/stream includes CORS headers for the local web app", async () => {
    app = await createTestRadioServer();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat/stream",
      headers: {
        origin: "http://127.0.0.1:3302"
      },
      payload: { message: "你好" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3302");
    expect(response.headers.vary).toContain("Origin");
  });

  it("returns music suggestions for user confirmation instead of enqueuing immediately", async () => {
    app = await createTestRadioServer(Array.from({ length: 14 }, (_, index) => ({
      id: `fake-track-${String(index + 1).padStart(3, "0")}`,
      title: `Fake Track ${index + 1}`,
      artist: "Fake Artist",
      durationMs: 180000 + index * 1000,
      source: "local" as const
    })));

    const response = await app.inject({
      method: "POST",
      url: "/api/chat/stream",
      payload: { message: "想听点类似的歌" }
    });

    expect(response.statusCode).toBe(200);
    const done = parseLastSseDone(response.payload);
    expect(done?.action).toMatchObject({
      type: "track-suggestion"
    });
    expect((done?.action as { tracks?: unknown[] } | undefined)?.tracks?.length).toBeGreaterThan(0);
    expect(done?.action?.type).not.toBe("next-track");

    // 候选名单只返回对话框，不直接改播放队列或切歌。
    const nowResponse = await app.inject({ method: "GET", url: "/api/now" });
    const now = nowResponse.json();
    expect(now.track).toBeNull();
    expect(now.queue.length).toBeGreaterThan(0);
  });
});
