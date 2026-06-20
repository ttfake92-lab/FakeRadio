import { afterEach, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeLlmAdapter, createFakeMusicAdapter, createFakeStorySourceAdapter, createFakeTtsAdapter } from "../test/fake-adapters.js";
import { createRadioServer } from "./create-server.js";

let app: FastifyInstance | undefined;
let isolatedBaseDirs: string[] = [];

function createFakeMusicAdapterResult() {
  return {
    music: createFakeMusicAdapter(),
    status: "ready" as const
  };
}

function createEmptyLikedSongsBaseDir() {
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-replan-route-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
  isolatedBaseDirs.push(dir);
  return dir;
}

async function createTestRadioServer(options: Parameters<typeof createRadioServer>[0] = {}) {
  return createRadioServer({
    ...options,
    llmAdapter: options.llmAdapter ?? createFakeLlmAdapter(),
    baseDir: options.baseDir ?? createEmptyLikedSongsBaseDir()
  });
}

async function setupBriefAndJob() {
  const briefResp = await app!.inject({
    method: "POST",
    url: "/api/chat",
    payload: { message: "帮我做一期 ReplanIntegrationTest 主题节目" }
  });
  expect(briefResp.statusCode).toBe(200);
  const briefId = briefResp.json().brief?.id;
  expect(briefId).toBeDefined();

  const plan = await app!.inject({
    method: "GET",
    url: `/api/plans/${briefId}/active`
  });
  expect(plan.json().plan).toBeDefined();
  const planId = plan.json().plan.id;

  const jobResp = await app!.inject({
    method: "POST",
    url: "/api/jobs",
    payload: { briefId, planId }
  });
  expect(jobResp.statusCode).toBe(201);
  const jobId = jobResp.json().job.id;

  return { briefId, planId, jobId };
}

describe("POST /api/jobs/:id/start", () => {
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    for (const dir of isolatedBaseDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    isolatedBaseDirs = [];
  });

  it("transitions needs-replan job and triggers re-execution", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createFakeStorySourceAdapter()
    });

    const { jobId } = await setupBriefAndJob();

    const startResp = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/start`
    });
    expect(startResp.statusCode).toBe(200);
    expect(startResp.json().job.status).toBe("running");

    const replanResp = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/needs-replan`,
      payload: { reason: "User added new constraints" }
    });
    expect(replanResp.statusCode).toBe(200);
    expect(replanResp.json().job.status).toBe("needs-replan");

    const restartResp = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/start`
    });
    expect(restartResp.statusCode).toBe(200);
    const finalStatus = restartResp.json().job.status;
    expect(["running", "completed", "failed"]).toContain(finalStatus);
  });

  it("returns 400 when starting a non-existent job", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createFakeStorySourceAdapter()
    });

    const resp = await app.inject({
      method: "POST",
      url: "/api/jobs/non-existent-id/start"
    });
    expect(resp.statusCode).toBe(400);
  });

  it("pending job can be started without triggering execution", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter(),
      storySourceAdapter: { async gather() { return []; } },
      publicMetadataAdapter: createFakeStorySourceAdapter()
    });

    const { jobId } = await setupBriefAndJob();

    const startResp = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/start`
    });
    expect(startResp.statusCode).toBe(200);
    expect(startResp.json().job.status).toBe("running");
  });
});
