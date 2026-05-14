import { describe, it, expect } from "vitest";
import type { ProgramBrief } from "@fakeradio/shared";
import { createDailyShowPlanGenerator } from "./daily-show-plan-generator.js";

function makeDailyBrief(overrides: Partial<ProgramBrief> = {}): ProgramBrief {
  const now = new Date().toISOString();
  return {
    id: "test-daily-brief",
    type: "daily-show",
    topic: "Daily Mix",
    targetDate: new Date().toISOString().slice(0, 10),
    priority: "daily-default",
    status: "confirmed",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("DailyShowPlanGenerator", () => {
  describe("generates time-period blocks", () => {
    it("creates blocks for morning, afternoon, and evening periods", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      expect(plan.blocks.length).toBeGreaterThan(0);

      const periods = new Set(plan.blocks.map(b => b.role));
      expect(periods.has("morning")).toBe(true);
      expect(periods.has("afternoon")).toBe(true);
      expect(periods.has("evening")).toBe(true);
    });

    it("respects custom block counts per period", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief, {
        morningBlocks: 3,
        afternoonBlocks: 1,
        eveningBlocks: 2
      });

      const morningBlocks = plan.blocks.filter(b => b.role === "morning");
      const afternoonBlocks = plan.blocks.filter(b => b.role === "afternoon");
      const eveningBlocks = plan.blocks.filter(b => b.role === "evening");

      expect(morningBlocks.length).toBe(3);
      expect(afternoonBlocks.length).toBe(1);
      expect(eveningBlocks.length).toBe(2);
    });

    it("assigns appropriate titles and story goals per period", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      const morningBlock = plan.blocks.find(b => b.role === "morning");
      const afternoonBlock = plan.blocks.find(b => b.role === "afternoon");
      const eveningBlock = plan.blocks.find(b => b.role === "evening");

      expect(morningBlock?.title).toContain("晨间");
      expect(morningBlock?.storyGoal).toContain("早晨");

      expect(afternoonBlock?.title).toContain("午后");
      expect(afternoonBlock?.storyGoal).toContain("午后");

      expect(eveningBlock?.title).toContain("晚间");
      expect(eveningBlock?.storyGoal).toContain("一天");
    });

    it("includes episode targets for each block", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      for (const block of plan.blocks) {
        expect(block.episodeTargets.length).toBeGreaterThan(0);
        const hasOpeningOrClosing = block.episodeTargets.some(
          t => t.role === "opening-music" || t.role === "closing-music"
        );
        expect(hasOpeningOrClosing).toBe(true);
      }
    });
  });

  describe("ShowPlan structure", () => {
    it("generates a valid ShowPlan with correct briefId", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief({ id: "my-daily-brief" });
      const plan = generator.generate(brief);

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.briefId).toBe("my-daily-brief");
      expect(plan.version).toBe(1);
      expect(plan.active).toBe(true);
      expect(plan.briefSnapshot.id).toBe("my-daily-brief");
    });

    it("respects custom totalDurationMinutes", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief, { totalDurationMinutes: 90 });

      expect(plan.totalDurationMinutes).toBe(90);
    });

    it("uses default 60 minutes when no duration specified", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      expect(plan.totalDurationMinutes).toBe(60);
    });

    it("includes createdAt and updatedAt timestamps", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      expect(plan.createdAt).toBeDefined();
      expect(plan.updatedAt).toBeDefined();
      expect(new Date(plan.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(plan.updatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("daily vs theme show plan difference", () => {
    it("generates time-period blocks instead of story-driven blocks", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      const validTimeRoles = new Set(["morning", "afternoon", "evening"]);
      const validStoryRoles = new Set([
        "opening",
        "origin",
        "turning-point",
        "signature-era",
        "relationship",
        "influence",
        "contrast",
        "personal-anchor",
        "closing"
      ]);

      for (const block of plan.blocks) {
        expect(validTimeRoles.has(block.role)).toBe(true);
        expect(validStoryRoles.has(block.role as never)).toBe(false);
      }
    });

    it("generates different blocks than ThemeShowPlanGenerator would for same brief", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief);

      const timePeriodRoles = new Set(["morning", "afternoon", "evening"]);
      const hasOnlyTimePeriodBlocks = plan.blocks.every(b => timePeriodRoles.has(b.role));
      expect(hasOnlyTimePeriodBlocks).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles zero blocks per period gracefully", () => {
      const generator = createDailyShowPlanGenerator();
      const brief = makeDailyBrief();
      const plan = generator.generate(brief, {
        morningBlocks: 0,
        afternoonBlocks: 0,
        eveningBlocks: 0
      });

      expect(plan.blocks.length).toBe(0);
    });

    it("handles brief without optional fields", () => {
      const generator = createDailyShowPlanGenerator();
      const brief: ProgramBrief = {
        id: "minimal-brief",
        type: "daily-show",
        topic: "Minimal",
        priority: "daily-default",
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect(() => generator.generate(brief)).not.toThrow();
    });
  });
});
