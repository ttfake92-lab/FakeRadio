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

  it("uses local date even when UTC has crossed to previous day", () => {
    const shanghaiMidnight = new Date(2026, 4, 1, 0, 30, 0);

    const plan = buildTodayPlan(shanghaiMidnight);

    expect(plan.date).toBe("2026-05-01");
  });
});
