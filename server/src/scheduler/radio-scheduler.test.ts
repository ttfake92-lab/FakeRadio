import { describe, expect, it } from "vitest";
import { buildTodayPlan, getCurrentPlanBlock } from "./radio-scheduler.js";

describe("radio scheduler", () => {
  it("builds a plan and picks current block by time", () => {
    const morning = new Date(2026, 3, 30, 8, 0, 0);
    const night = new Date(2026, 3, 30, 21, 30, 0);

    const plan = buildTodayPlan(morning);

    expect(plan.blocks).toHaveLength(3);
    expect(getCurrentPlanBlock(plan, morning)?.moodHint).toBe("warm morning indie");
    expect(getCurrentPlanBlock(plan, night)?.moodHint).toBe("ambient pop night");
  });
});
