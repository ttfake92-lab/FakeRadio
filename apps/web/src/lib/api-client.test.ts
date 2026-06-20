import { afterEach, describe, expect, it, vi } from "vitest";
import { generateNow, getJob } from "./api-client";

describe("getJob", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns job from GET /api/jobs/:id", async () => {
    const mockJob = {
      id: "job-001",
      briefId: "brief-001",
      planId: "plan-001",
      status: "running",
      createdAt: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z",
      startedAt: "2026-05-15T10:00:01.000Z",
      logs: [
        { level: "info", message: "Job started", timestamp: "2026-05-15T10:00:01.000Z", phase: "running" }
      ],
      trace: []
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ job: mockJob })
    }) as typeof fetch;

    const result = await getJob("job-001");
    expect(result?.job?.id).toBe("job-001");
    expect(result?.job?.status).toBe("running");
    expect(result?.job?.logs).toHaveLength(1);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain("/api/jobs/job-001");
  });

  it("returns null job when response is 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "job not found" })
    }) as typeof fetch;

    const result = await getJob("nonexistent");
    expect(result?.job).toBeNull();
  });

  it("returns null job when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error")) as typeof fetch;

    const result = await getJob("job-001");
    expect(result?.job).toBeNull();
  });
});

describe("generateNow", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts briefId to /api/shows/generate-now", async () => {
    const project = {
      id: "project-001",
      briefId: "brief-001",
      slug: "test-show",
      directoryPath: "/tmp/test-show",
      status: "ready",
      activePlanId: "plan-001",
      activeJobId: "job-001",
      createdAt: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z"
    };
    const job = {
      id: "job-001",
      briefId: "brief-001",
      planId: "plan-001",
      status: "completed",
      createdAt: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:01.000Z",
      completedAt: "2026-05-15T10:00:01.000Z",
      logs: [],
      trace: []
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ project, job })
    }) as typeof fetch;

    const result = await generateNow("brief-001");

    expect(result.job.status).toBe("completed");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain("/api/shows/generate-now");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ briefId: "brief-001" })
    });
  });
});
