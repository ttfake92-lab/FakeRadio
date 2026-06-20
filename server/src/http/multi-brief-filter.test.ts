import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeLlmAdapter, createFakeMusicAdapter, createFakeTtsAdapter } from "../test/fake-adapters.js";
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
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-multi-brief-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  mkdirSync(join(dir, "programs"), { recursive: true });
  isolatedBaseDirs.push(dir);
  return dir;
}

function createTestRadioServer(options: Parameters<typeof createRadioServer>[0] = {}) {
  return createRadioServer({
    ...options,
    llmAdapter: options.llmAdapter ?? createFakeLlmAdapter(),
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

describe("Multi-brief API filtering", () => {
  it("GET /api/plans?briefId=X returns only plans for that brief", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter()
    });

    const briefAResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Beatles 主题节目" }
    });
    expect(briefAResponse.statusCode).toBe(200);
    const briefA = briefAResponse.json().brief;

    const briefBResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Rolling Stones 主题节目" }
    });
    expect(briefBResponse.statusCode).toBe(200);
    const briefB = briefBResponse.json().brief;

    const plansForA = await app.inject({ method: "GET", url: `/api/plans?briefId=${briefA.id}` });
    expect(plansForA.statusCode).toBe(200);
    const bodyA = plansForA.json();
    expect(bodyA.plans).toBeInstanceOf(Array);
    expect(bodyA.plans.length).toBeGreaterThan(0);
    for (const plan of bodyA.plans) {
      expect(plan.briefId).toBe(briefA.id);
    }

    const plansForB = await app.inject({ method: "GET", url: `/api/plans?briefId=${briefB.id}` });
    expect(plansForB.statusCode).toBe(200);
    const bodyB = plansForB.json();
    expect(bodyB.plans).toBeInstanceOf(Array);
    expect(bodyB.plans.length).toBeGreaterThan(0);
    for (const plan of bodyB.plans) {
      expect(plan.briefId).toBe(briefB.id);
    }

    const allPlans = await app.inject({ method: "GET", url: "/api/plans" });
    expect(allPlans.statusCode).toBe(200);
    const allBody = allPlans.json();
    expect(allBody.plans.length).toBe(bodyA.plans.length + bodyB.plans.length);
  });

  it("GET /api/jobs?briefId=X returns only jobs for that brief", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter()
    });

    const briefAResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Queen 主题节目" }
    });
    expect(briefAResponse.statusCode).toBe(200);
    const briefA = briefAResponse.json().brief;

    const briefBResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 David Bowie 主题节目" }
    });
    expect(briefBResponse.statusCode).toBe(200);
    const briefB = briefBResponse.json().brief;

    await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { briefId: briefA.id, planId: "plan-placeholder-a" }
    });

    await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { briefId: briefB.id, planId: "plan-placeholder-b" }
    });

    const jobsForA = await app.inject({ method: "GET", url: `/api/jobs?briefId=${briefA.id}` });
    expect(jobsForA.statusCode).toBe(200);
    const bodyA = jobsForA.json();
    expect(bodyA.jobs).toBeInstanceOf(Array);
    expect(bodyA.jobs.length).toBe(1);
    expect(bodyA.jobs[0].briefId).toBe(briefA.id);

    const jobsForB = await app.inject({ method: "GET", url: `/api/jobs?briefId=${briefB.id}` });
    expect(jobsForB.statusCode).toBe(200);
    const bodyB = jobsForB.json();
    expect(bodyB.jobs).toBeInstanceOf(Array);
    expect(bodyB.jobs.length).toBe(1);
    expect(bodyB.jobs[0].briefId).toBe(briefB.id);
  });

  it("switching briefId filters returns correct data for each brief", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter()
    });

    const brief1Response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Led Zeppelin 主题节目" }
    });
    expect(brief1Response.statusCode).toBe(200);
    const brief1 = brief1Response.json().brief;

    const brief2Response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Pink Floyd 主题节目" }
    });
    expect(brief2Response.statusCode).toBe(200);
    const brief2 = brief2Response.json().brief;

    const getBrief1Plans = async () => {
      const response = await app!.inject({ method: "GET", url: `/api/plans?briefId=${brief1.id}` });
      return response.json().plans;
    };

    const getBrief2Plans = async () => {
      const response = await app!.inject({ method: "GET", url: `/api/plans?briefId=${brief2.id}` });
      return response.json().plans;
    };

    const plans1 = await getBrief1Plans();
    const plans2 = await getBrief2Plans();

    expect(plans1.length).toBeGreaterThan(0);
    expect(plans2.length).toBeGreaterThan(0);

    const planIds1 = new Set(plans1.map((p: { id: string }) => p.id));
    const planIds2 = new Set(plans2.map((p: { id: string }) => p.id));

    for (const planId of planIds1) {
      expect(planIds2.has(planId)).toBe(false);
    }

    for (const planId of planIds2) {
      expect(planIds1.has(planId)).toBe(false);
    }
  });

  it("GET /api/plans without briefId returns all plans", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter()
    });

    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 U2 主题节目" }
    });

    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Coldplay 主题节目" }
    });

    const allPlans = await app.inject({ method: "GET", url: "/api/plans" });
    expect(allPlans.statusCode).toBe(200);
    const body = allPlans.json();
    expect(body.plans.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/jobs without briefId returns all jobs", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter()
    });

    const briefAResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Radiohead 主题节目" }
    });
    const briefA = briefAResponse.json().brief;

    const briefBResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Muse 主题节目" }
    });
    const briefB = briefBResponse.json().brief;

    await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { briefId: briefA.id, planId: "plan-a" }
    });

    await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { briefId: briefB.id, planId: "plan-b" }
    });

    const allJobs = await app.inject({ method: "GET", url: "/api/jobs" });
    expect(allJobs.statusCode).toBe(200);
    const body = allJobs.json();
    expect(body.jobs.length).toBe(2);
  });
});
