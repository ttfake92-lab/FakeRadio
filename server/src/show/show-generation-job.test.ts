import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createJobRegistry,
  type JobRegistry,
  type ShowJob
} from "./show-generation-job.js";

describe("ShowGenerationJob", () => {
  let testDir: string;
  let registry: JobRegistry;

  beforeEach(() => {
    testDir = join(tmpdir(), `fakeradio-job-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    registry = createJobRegistry(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestJob(overrides: Partial<ShowJob> = {}): ShowJob {
    const now = new Date().toISOString();
    return {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      briefId: "brief-001",
      planId: "plan-001",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      logs: [],
      trace: [],
      ...overrides
    };
  }

  describe("job lifecycle", () => {
    it("creates a job with pending status", async () => {
      const job = await registry.create({
        briefId: "brief-001",
        planId: "plan-001"
      });

      expect(job.status).toBe("pending");
      expect(job.briefId).toBe("brief-001");
      expect(job.planId).toBe("plan-001");
      expect(job.logs).toEqual([]);
      expect(job.trace).toEqual([]);
    });

    it("transitions from pending to running", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      const started = await registry.start(job.id);

      expect(started?.status).toBe("running");
    });

    it("transitions from running to paused", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      const paused = await registry.pause(job.id);

      expect(paused?.status).toBe("paused");
    });

    it("transitions from running to completed", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      const completed = await registry.complete(job.id);

      expect(completed?.status).toBe("completed");
    });

    it("transitions from running to failed", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      const failed = await registry.fail(job.id, "Generation failed: no tracks found");

      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("Generation failed: no tracks found");
    });

    it("transitions from running to cancelled", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      const cancelled = await registry.cancel(job.id);

      expect(cancelled?.status).toBe("cancelled");
    });

    it("transitions from running to needs-replan", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      const needsReplan = await registry.markNeedsReplan(job.id, "User added constraint");

      expect(needsReplan?.status).toBe("needs-replan");
      expect(needsReplan?.reason).toBe("User added constraint");
    });
  });

  describe("get and list", () => {
    it("returns job by id", async () => {
      const created = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      const found = await registry.get(created.id);

      expect(found?.id).toBe(created.id);
    });

    it("returns null for non-existent job", async () => {
      const found = await registry.get("non-existent");
      expect(found).toBeNull();
    });

    it("lists all jobs", async () => {
      await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.create({ briefId: "brief-002", planId: "plan-002" });

      const jobs = await registry.list();

      expect(jobs).toHaveLength(2);
    });

    it("lists jobs by briefId", async () => {
      const job1 = await registry.create({ briefId: "brief-x", planId: "plan-001" });
      const job2 = await registry.create({ briefId: "brief-x", planId: "plan-002" });
      await registry.create({ briefId: "brief-y", planId: "plan-003" });

      const jobs = await registry.list({ briefId: "brief-x" });

      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.id)).toContain(job1.id);
      expect(jobs.map((j) => j.id)).toContain(job2.id);
    });
  });

  describe("invalid state transitions", () => {
    it("cannot start a completed job", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      await registry.complete(job.id);

      const result = await registry.start(job.id);

      expect(result).toBeNull();
    });

    it("cannot pause a pending job", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });

      const result = await registry.pause(job.id);

      expect(result).toBeNull();
    });

    it("cannot cancel a completed job", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      await registry.start(job.id);
      await registry.complete(job.id);

      const result = await registry.cancel(job.id);

      expect(result).toBeNull();
    });
  });

  describe("logs and trace persistence", () => {
    it("adds and persists production logs", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      
      const log1 = await registry.addLog(job.id, {
        level: "info",
        message: "Job created",
        category: "job"
      });
      
      const log2 = await registry.addLog(job.id, {
        level: "info",
        message: "Job started",
        category: "job"
      });
      
      expect(log1).not.toBeNull();
      expect(log2).not.toBeNull();
      
      // Read back from database
      const retrieved = await registry.get(job.id);
      expect(retrieved?.logs).toHaveLength(2);
      expect(retrieved?.logs[0].message).toBe("Job created");
      expect(retrieved?.logs[1].message).toBe("Job started");
    });

    it("adds and persists tech trace entries", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      
      const trace1 = await registry.addTrace(job.id, {
        type: "llm",
        summary: "LLM call to generate show plan",
        durationMs: 150
      });
      
      const trace2 = await registry.addTrace(job.id, {
        type: "tts",
        summary: "TTS synthesis for opening",
        durationMs: 80
      });
      
      expect(trace1).not.toBeNull();
      expect(trace2).not.toBeNull();
      
      // Read back from database
      const retrieved = await registry.get(job.id);
      expect(retrieved?.trace).toHaveLength(2);
      expect(retrieved?.trace[0].summary).toBe("LLM call to generate show plan");
      expect(retrieved?.trace[1].summary).toBe("TTS synthesis for opening");
    });

    it("persists logs/trace without requiring status change", async () => {
      const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
      
      // Start job first
      await registry.start(job.id);
      
      // Add multiple logs without changing status
      await registry.addLog(job.id, { level: "info", message: "Generating episodes", category: "generation" });
      await registry.addLog(job.id, { level: "info", message: "Fetching tracks", category: "generation" });
      await registry.addTrace(job.id, { type: "music", summary: "Fetched 5 tracks", durationMs: 200 });
      
      // Read back
      const retrieved = await registry.get(job.id);
      expect(retrieved?.status).toBe("running"); // status still running
      expect(retrieved?.logs).toHaveLength(2);
      expect(retrieved?.trace).toHaveLength(1);
    });
  });
});
