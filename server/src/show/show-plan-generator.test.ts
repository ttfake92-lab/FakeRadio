import { describe, expect, it } from "vitest";
import { createShowPlanGenerator } from "./show-plan-generator.js";
import type { ProgramBrief } from "@fakeradio/shared";

describe("ShowPlanGenerator", () => {
  function createTestBrief(overrides: Partial<ProgramBrief> = {}): ProgramBrief {
    const now = new Date().toISOString();
    return {
      id: `brief-${Date.now()}`,
      type: "theme-show",
      topic: "Bee Gees",
      targetDate: "2026-05-12",
      priority: "user-requested",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  it("generates a show plan with 4-8 blocks for theme show", async () => {
    const generator = createShowPlanGenerator();
    const brief = createTestBrief();
    const plan = await generator.generate(brief);

    expect(plan.id).toBeDefined();
    expect(plan.briefId).toBe(brief.id);
    expect(plan.version).toBe(1);
    expect(plan.active).toBe(true);
    expect(plan.briefSnapshot).toEqual(brief);
    expect(plan.blocks.length).toBeGreaterThanOrEqual(4);
    expect(plan.blocks.length).toBeLessThanOrEqual(8);
    expect(plan.createdAt).toBeDefined();
    expect(plan.updatedAt).toBeDefined();
  });

  it("uses only allowed block roles", async () => {
    const allowedRoles = new Set([
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

    const generator = createShowPlanGenerator();
    const brief = createTestBrief();
    const plan = await generator.generate(brief);

    plan.blocks.forEach((block) => {
      expect(allowedRoles).toContain(block.role);
    });
  });

  it("always starts with opening and ends with closing", async () => {
    const generator = createShowPlanGenerator();
    const brief = createTestBrief();
    const plan = await generator.generate(brief);

    expect(plan.blocks[0].role).toBe("opening");
    expect(plan.blocks[plan.blocks.length - 1].role).toBe("closing");
  });
});
