import { describe, expect, it } from "vitest";
import { buildTodayPlan, getCurrentPlanBlock } from "./radio-scheduler.js";

describe("radio scheduler", () => {
  it("builds a plan and picks current block by time", () => {
    const morning = new Date(2026, 3, 30, 8, 0, 0);
    const night = new Date(2026, 3, 30, 21, 30, 0);
    const midnight = new Date(2026, 3, 30, 0, 30, 0);
    const noon = new Date(2026, 3, 30, 12, 30, 0);

    const plan = buildTodayPlan(morning);

    expect(plan.blocks).toHaveLength(6);
    expect(getCurrentPlanBlock(plan, midnight)?.moodHint).toBe("ambient sleep");
    expect(getCurrentPlanBlock(plan, morning)?.moodHint).toBe("warm morning indie");
    expect(getCurrentPlanBlock(plan, noon)?.moodHint).toBe("light acoustic");
    expect(getCurrentPlanBlock(plan, night)?.moodHint).toBe("ambient pop night");
  });

  it("uses local date even when UTC has crossed to previous day", () => {
    const shanghaiMidnight = new Date(2026, 4, 1, 0, 30, 0); // Local time is 2026-05-01 00:30, UTC is 2026-04-30 16:30

    const plan = buildTodayPlan(shanghaiMidnight);

    expect(plan.date).toBe("2026-05-01");
  });

  it("selects correct plan block even when process runs in UTC timezone", () => {
    // Save original TZ
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";

    try {
      // 2026-05-01T00:30:00+08:00 (Asia/Shanghai midnight block)
      const shanghaiMidnight = new Date("2026-04-30T16:30:00Z");
      const plan = buildTodayPlan(shanghaiMidnight);

      const block = getCurrentPlanBlock(plan, shanghaiMidnight);

      // Should pick 00:00 block based on Asia/Shanghai time
      expect(block?.moodHint).toBe("ambient sleep");
    } finally {
      // Restore original TZ
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
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

    expect(plan.blocks).toHaveLength(6);
    expect(plan.blocks[0].moodHint).toBe("ambient sleep");
    expect(plan.blocks[0].label).toBe("午夜静谧");
    expect(plan.blocks[1].moodHint).toBe("warm morning indie");
    expect(plan.blocks[1].label).toBe("早晨轻启动");
  });
});
