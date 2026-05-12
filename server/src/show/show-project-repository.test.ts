import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createShowProjectRepository } from "./show-project-repository.js";

describe("createShowProjectRepository", () => {
  let tempDir: string;
  let baseDir: string;
  let repo: ReturnType<typeof createShowProjectRepository>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "show-project-repo-test-"));
    baseDir = join(tempDir, "shows");
    repo = createShowProjectRepository(baseDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates a project directory with YYYY-MM-DD-slug format", async () => {
    const project = await repo.create({
      briefId: "brief-001",
      slug: "2026-05-12-bee-gees"
    });

    expect(project.directoryPath).toMatch(/^.*\/2026-05-12-bee-gees$/);
    expect(existsSync(project.directoryPath)).toBe(true);
    expect(project.slug).toBe("2026-05-12-bee-gees");
    expect(project.status).toBe("draft");
    expect(project.id).toBeDefined();
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
  });

  it("rejects duplicate slugs", async () => {
    await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    await expect(
      repo.create({ briefId: "brief-002", slug: "2026-05-12-bee-gees" })
    ).rejects.toThrow();
  });

  it("writes show-plan.json to the project directory", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    const plan = {
      id: "plan-001",
      version: 1,
      briefId: "brief-001",
      active: true,
      blocks: [
        { role: "opening", title: "Bee Gees Intro", storyGoal: "Set mood", selectionGoal: "Warm opener", sourceNeeds: [], constraints: {}, episodeTargets: [] }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await repo.saveShowPlan(project.id, plan);
    const savedPlan = await repo.getShowPlan(project.id);

    expect(savedPlan).toEqual(plan);
    expect(existsSync(join(project.directoryPath, "show-plan.json"))).toBe(true);
  });

  it("appends a production trace line and reads it back", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });

    await repo.appendTrace(project.id, { level: "info", message: "Generation started", timestamp: "2026-05-12T10:00:00Z" });
    await repo.appendTrace(project.id, { level: "info", message: "Block 1 complete", timestamp: "2026-05-12T10:01:00Z" });

    const lines = await repo.getTraceLines(project.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ level: "info", message: "Generation started", timestamp: "2026-05-12T10:00:00Z" });
    expect(lines[1]).toEqual({ level: "info", message: "Block 1 complete", timestamp: "2026-05-12T10:01:00Z" });
  });

  it("getTraceLines returns empty array when no trace file exists", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    const lines = await repo.getTraceLines(project.id);
    expect(lines).toEqual([]);
  });

  it("deletes a single trace file but keeps the project directory", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    await repo.appendTrace(project.id, { level: "info", message: "Test", timestamp: "2026-05-12T10:00:00Z" });
    await repo.appendTrace(project.id, { level: "info", message: "Test 2", timestamp: "2026-05-12T10:01:00Z" });

    await repo.deleteTrace(project.id);

    expect(existsSync(join(project.directoryPath, "production-trace.jsonl"))).toBe(false);
    expect(existsSync(project.directoryPath)).toBe(true);
    const updated = await repo.get(project.id);
    expect(updated?.productionTracePath).toBeUndefined();
  });

  it("deletes the entire project directory and removes from registry", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    await repo.saveShowPlan(project.id, {
      id: "plan-001", version: 1, briefId: "brief-001", active: true,
      blocks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await repo.appendTrace(project.id, { level: "info", message: "Test", timestamp: "2026-05-12T10:00:00Z" });

    await repo.delete(project.id);

    expect(existsSync(project.directoryPath)).toBe(false);
    const found = await repo.get(project.id);
    expect(found).toBeNull();
  });

  it("get returns project by id", async () => {
    const created = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    const found = await repo.get(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.slug).toBe("2026-05-12-bee-gees");
  });

  it("get returns null for unknown id", async () => {
    const found = await repo.get("unknown-id");
    expect(found).toBeNull();
  });

  it("getByBriefId returns project for given brief", async () => {
    const created = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    const found = await repo.getByBriefId("brief-001");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("list returns all projects ordered by createdAt desc", async () => {
    const p1 = await repo.create({ briefId: "b-001", slug: "2026-05-10-theme-a" });
    await repo.create({ briefId: "b-002", slug: "2026-05-11-theme-b" });
    const p3 = await repo.create({ briefId: "b-003", slug: "2026-05-12-theme-c" });

    const listed = await repo.list();
    expect(listed).toHaveLength(3);
    expect(listed[0].id).toBe(p3.id);
    expect(listed[listed.length - 1].id).toBe(p1.id);
  });

  it("list respects limit parameter", async () => {
    await repo.create({ briefId: "b-001", slug: "2026-05-10-theme-a" });
    await repo.create({ briefId: "b-002", slug: "2026-05-11-theme-b" });
    await repo.create({ briefId: "b-003", slug: "2026-05-12-theme-c" });

    const listed = await repo.list(2);
    expect(listed).toHaveLength(2);
  });

  it("updates project metadata including showPlanPath and productionTracePath", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });

    await repo.saveShowPlan(project.id, {
      id: "plan-001", version: 1, briefId: "brief-001", active: true,
      blocks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await repo.appendTrace(project.id, { level: "info", message: "Test", timestamp: "2026-05-12T10:00:00Z" });

    const updated = await repo.get(project.id);
    expect(updated?.showPlanPath).toBe(join(project.directoryPath, "show-plan.json"));
    expect(updated?.productionTracePath).toBe(join(project.directoryPath, "production-trace.jsonl"));
  });

  it("does not create subdirectory outside of base shows directory", async () => {
    const project = await repo.create({ briefId: "brief-001", slug: "2026-05-12-bee-gees" });
    await expect(
      repo.create({ briefId: "brief-002", slug: "../../../etc/passwd" })
    ).rejects.toThrow();
  });
});
