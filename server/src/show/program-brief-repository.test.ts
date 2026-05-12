import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createProgramBriefRepository,
  type ProgramBriefRepository
} from "./program-brief-repository.js";
import type { ProgramBrief } from "@fakeradio/shared";

describe("ProgramBriefRepository", () => {
  let testDir: string;
  let repo: ProgramBriefRepository;

  beforeEach(() => {
    testDir = join(tmpdir(), `fakeradio-brief-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    repo = createProgramBriefRepository(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestBrief(overrides: Partial<ProgramBrief> = {}): ProgramBrief {
    const now = new Date().toISOString();
    return {
      id: `brief-${Date.now()}`,
      type: "theme-show",
      topic: "Bee Gees",
      scope: "full-show",
      targetDate: "2026-05-12",
      priority: "user-requested",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  describe("save", () => {
    it("saves a new brief and returns it", async () => {
      const brief = createTestBrief();
      const saved = await repo.save(brief);

      expect(saved.id).toBe(brief.id);
      expect(saved.type).toBe("theme-show");
      expect(saved.topic).toBe("Bee Gees");
    });

    it("updates an existing brief", async () => {
      const brief = createTestBrief();
      await repo.save(brief);

      const updated = await repo.save({
        ...brief,
        status: "confirmed",
        updatedAt: new Date().toISOString()
      });

      expect(updated.status).toBe("confirmed");
    });
  });

  describe("get", () => {
    it("returns null for non-existent brief", async () => {
      const result = await repo.get("non-existent-id");
      expect(result).toBeNull();
    });

    it("returns saved brief by id", async () => {
      const brief = createTestBrief({ id: "brief-123" });
      await repo.save(brief);

      const result = await repo.get("brief-123");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("brief-123");
      expect(result?.topic).toBe("Bee Gees");
    });
  });

  describe("list", () => {
    it("returns empty array when no briefs exist", async () => {
      const result = await repo.list();
      expect(result).toEqual([]);
    });

    it("lists all briefs", async () => {
      const brief1 = createTestBrief({ id: "brief-1", topic: "Bee Gees" });
      const brief2 = createTestBrief({ id: "brief-2", topic: "ABBA" });

      await repo.save(brief1);
      await repo.save(brief2);

      const result = await repo.list();

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.topic)).toContain("Bee Gees");
      expect(result.map((b) => b.topic)).toContain("ABBA");
    });

    it("filters by status", async () => {
      const brief1 = createTestBrief({ id: "brief-1", status: "draft" });
      const brief2 = createTestBrief({ id: "brief-2", status: "confirmed" });

      await repo.save(brief1);
      await repo.save(brief2);

      const result = await repo.list({ status: "draft" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("draft");
    });

    it("filters by type", async () => {
      const brief1 = createTestBrief({ id: "brief-1", type: "theme-show" });
      const brief2 = createTestBrief({ id: "brief-2", type: "daily-show", topic: undefined });

      await repo.save(brief1);
      await repo.save(brief2);

      const result = await repo.list({ type: "theme-show" });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("theme-show");
    });

    it("filters by targetDate", async () => {
      const brief1 = createTestBrief({ id: "brief-1", targetDate: "2026-05-12" });
      const brief2 = createTestBrief({ id: "brief-2", targetDate: "2026-05-13" });

      await repo.save(brief1);
      await repo.save(brief2);

      const result = await repo.list({ targetDate: "2026-05-12" });

      expect(result).toHaveLength(1);
      expect(result[0].targetDate).toBe("2026-05-12");
    });
  });

  describe("updateStatus", () => {
    it("updates brief status", async () => {
      const brief = createTestBrief({ id: "brief-1", status: "draft" });
      await repo.save(brief);

      await repo.updateStatus("brief-1", "confirmed");

      const result = await repo.get("brief-1");
      expect(result?.status).toBe("confirmed");
    });

    it("throws for non-existent brief", async () => {
      await expect(repo.updateStatus("non-existent", "confirmed")).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("deletes an existing brief", async () => {
      const brief = createTestBrief({ id: "brief-1" });
      await repo.save(brief);

      await repo.delete("brief-1");

      const result = await repo.get("brief-1");
      expect(result).toBeNull();
    });

    it("does not throw for non-existent brief", async () => {
      await expect(repo.delete("non-existent")).resolves.not.toThrow();
    });
  });
});
