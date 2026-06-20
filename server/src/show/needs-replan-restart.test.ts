import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createJobRegistry,
  type JobRegistry
} from "./show-generation-job.js";

describe("needs-replan job restart lifecycle", () => {
  let testDir: string;
  let registry: JobRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    testDir = join(tmpdir(), `fakeradio-replan-registry-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(testDir, { recursive: true });
    registry = createJobRegistry(testDir);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("allows transition from needs-replan to running", async () => {
    const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
    await registry.start(job.id);
    const needsReplanJob = await registry.markNeedsReplan(job.id, "User added new constraints");
    expect(needsReplanJob?.status).toBe("needs-replan");

    const restartedJob = await registry.start(job.id);
    expect(restartedJob).not.toBeNull();
    expect(restartedJob!.status).toBe("running");
  });

  it("job restarted from needs-replan retains the same id and briefId", async () => {
    const job = await registry.create({ briefId: "brief-xyz", planId: "plan-xyz" });
    await registry.start(job.id);
    await registry.markNeedsReplan(job.id, "User added constraints");

    const restartedJob = await registry.start(job.id);
    expect(restartedJob!.id).toBe(job.id);
    expect(restartedJob!.briefId).toBe("brief-xyz");
    expect(restartedJob!.planId).toBe("plan-xyz");
  });

  it("needs-replan job restarted has updatedAt timestamp", async () => {
    const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
    await registry.start(job.id);
    const needsReplanJob = await registry.markNeedsReplan(job.id, "User added constraints");
    const replanUpdatedAt = needsReplanJob!.updatedAt;

    vi.advanceTimersByTime(10);
    const restartedJob = await registry.start(job.id);
    expect(restartedJob!.updatedAt).not.toBe(replanUpdatedAt);
    expect(new Date(restartedJob!.updatedAt).getTime()).toBeGreaterThan(new Date(replanUpdatedAt).getTime());
  });

  it("pending job can be started (not needs-replan)", async () => {
    const job = await registry.create({ briefId: "brief-001", planId: "plan-001" });
    const startedJob = await registry.start(job.id);

    expect(startedJob).not.toBeNull();
    expect(startedJob!.status).toBe("running");
  });
});
