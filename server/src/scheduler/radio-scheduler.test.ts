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

  it("uses playlist seeds as mood hints when playlists provided", () => {
    const morning = new Date(2026, 3, 30, 8, 0, 0);
    const customPlaylists = [
      { name: "Custom Morning", seeds: ["custom seed 1"] },
      { name: "Custom Focus", seeds: ["custom seed 2"] },
      { name: "Custom Night", seeds: ["custom seed 3"] }
    ];

    const plan = buildTodayPlan(morning, customPlaylists);

    expect(plan.blocks).toHaveLength(3);
    expect(plan.blocks[0].moodHint).toBe("custom seed 1");
    expect(plan.blocks[1].moodHint).toBe("custom seed 2");
    expect(plan.blocks[2].moodHint).toBe("custom seed 3");
    expect(plan.blocks[0].label).toBe("Custom Morning");
  });

  it("falls back to defaults when playlists are empty", () => {
    const morning = new Date(2026, 3, 30, 8, 0, 0);

    const plan = buildTodayPlan(morning, []);

    expect(plan.blocks[0].moodHint).toBe("warm morning indie");
    expect(plan.blocks[0].label).toBe("早晨轻启动");
  });
});
