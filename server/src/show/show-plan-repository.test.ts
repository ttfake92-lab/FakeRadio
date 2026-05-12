import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createShowPlanRepository,
  type ShowPlanRepository
} from "./show-plan-repository.js";
import type { ShowPlan, ShowPlanBlock } from "@fakeradio/shared";

describe("ShowPlanRepository", () => {
  let testDir: string;
  let repo: ShowPlanRepository;

  beforeEach(() => {
    testDir = join(tmpdir(), `fakeradio-showplan-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    repo = createShowPlanRepository(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestPlan(overrides: Partial<ShowPlan> = {}): ShowPlan {
    const now = new Date().toISOString();
    return {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      briefId: "brief-001",
      version: 1,
      active: true,
      briefSnapshot: {
        id: "brief-001",
        type: "theme-show",
        topic: "Bee Gees",
        targetDate: "2026-05-12",
        priority: "user-requested",
        status: "draft",
        createdAt: now,
        updatedAt: now
      },
      blocks: [
        {
          role: "opening",
          title: "开场",
          storyGoal: "用标志性曲目开场",
          selectionGoal: "选择 Stayin' Alive",
          sourceNeeds: [],
          constraints: {},
          episodeTargets: []
        }
      ],
      totalDurationMinutes: 60,
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  describe("save", () => {
    it("saves a new show plan and returns it", async () => {
      const plan = createTestPlan();
      const saved = await repo.save(plan);

      expect(saved.id).toBe(plan.id);
      expect(saved.briefId).toBe("brief-001");
      expect(saved.version).toBe(1);
      expect(saved.active).toBe(true);
    });

    it("saves a new version and deactivates previous", async () => {
      const plan1 = createTestPlan({ version: 1, active: true });
      await repo.save(plan1);

      const plan2 = createTestPlan({ id: plan1.id, version: 2, active: true });
      await repo.save(plan2);

      const all = await repo.list({ briefId: plan1.briefId });
      const p1Stored = all.find((p) => p.version === 1);
      const p2Stored = all.find((p) => p.version === 2);

      expect(p1Stored?.active).toBe(false);
      expect(p2Stored?.active).toBe(true);
    });
  });

  describe("get", () => {
    it("returns null for non-existent plan", async () => {
      const result = await repo.get("non-existent-id");
      expect(result).toBeNull();
    });

    it("returns saved plan by id and version", async () => {
      const plan = createTestPlan({ id: "plan-123", version: 1 });
      await repo.save(plan);

      const result = await repo.get("plan-123", 1);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("plan-123");
      expect(result!.version).toBe(1);
    });

    it("returns latest active plan when version omitted", async () => {
      await repo.save(createTestPlan({ id: "plan-latest", version: 1, active: false }));
      await repo.save(createTestPlan({ id: "plan-latest", version: 2, active: true }));

      const result = await repo.get("plan-latest");

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.active).toBe(true);
    });
  });

  describe("list", () => {
    it("returns empty array when no plans exist", async () => {
      const result = await repo.list();
      expect(result).toEqual([]);
    });

    it("returns all plans for a brief", async () => {
      await repo.save(createTestPlan({ id: "plan-v1", briefId: "brief-x", version: 1 }));
      await repo.save(createTestPlan({ id: "plan-v2", briefId: "brief-x", version: 2, active: false }));
      await repo.save(createTestPlan({ id: "plan-other", briefId: "brief-y", version: 1 }));

      const result = await repo.list({ briefId: "brief-x" });

      expect(result).toHaveLength(2);
    });

    it("returns only active plans when filter set", async () => {
      await repo.save(createTestPlan({ id: "plan-active", briefId: "brief-z", version: 1, active: true }));
      await repo.save(createTestPlan({ id: "plan-inactive", briefId: "brief-z", version: 2, active: false }));

      const result = await repo.list({ briefId: "brief-z", activeOnly: true });

      expect(result).toHaveLength(1);
      expect(result[0].active).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes all versions of a plan", async () => {
      await repo.save(createTestPlan({ id: "plan-del", version: 1 }));
      await repo.save(createTestPlan({ id: "plan-del", version: 2 }));

      await repo.delete("plan-del");

      const result = await repo.list({ briefId: "brief-001" });
      const found = result.find((p) => p.id === "plan-del");
      expect(found).toBeUndefined();
    });
  });
});
