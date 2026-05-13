import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockMusicAdapter, createMockStorySourceAdapter, createMockTtsAdapter } from "../adapters/index.js";
import { createRadioServer } from "./create-server.js";

vi.mock("../show/scheduler-integration.js", async () => {
  const actual = await import("../show/scheduler-integration.js");
  return {
    ...actual,
    executeScheduledJob: vi.fn().mockResolvedValue(undefined)
  };
});

let app: FastifyInstance | undefined;

function createMockMusicAdapterResult() {
  return {
    music: createMockMusicAdapter(),
    status: "mock" as const
  };
}

function createEmptyLikedSongsBaseDir() {
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-export-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
  return dir;
}

async function createTestRadioServer(options: Parameters<typeof createRadioServer>[0] = {}) {
  return createRadioServer({
    ...options,
    baseDir: options.baseDir ?? createEmptyLikedSongsBaseDir()
  });
}

describe("POST /api/projects/:id/export returns 400 for incomplete job", () => {
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 400 when job has not completed", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createMockStorySourceAdapter()
    });

    const briefResp = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Export Test 主题节目" }
    });
    expect(briefResp.statusCode).toBe(200);
    const briefId = briefResp.json().brief?.id;
    expect(briefId).toBeDefined();

    const plan = await app.inject({
      method: "GET",
      url: `/api/plans/${briefId}/active`
    });
    expect(plan.json().plan).toBeDefined();

    const generateResp = await app.inject({
      method: "POST",
      url: "/api/shows/generate-now",
      payload: { briefId }
    });
    expect(generateResp.statusCode).toBe(201);
    const { project: projectData } = generateResp.json();
    const projectId = projectData.id;

    const exportResp = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/export`,
      payload: { includeTrace: true }
    });

    expect(exportResp.statusCode).toBe(400);
    expect(exportResp.json().error).toContain("尚未完成生成");
  });
});
