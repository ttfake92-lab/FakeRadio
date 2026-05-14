import type { ShowPlan, ProgramBrief, ShowPlanBlock } from "@fakeradio/shared";
import { randomUUID } from "node:crypto";

export type DailyShowPlanGeneratorOptions = {
  morningBlocks?: number;
  afternoonBlocks?: number;
  eveningBlocks?: number;
  totalDurationMinutes?: number;
};

export type DailyShowPlanGenerator = {
  generate(brief: ProgramBrief, options?: DailyShowPlanGeneratorOptions): ShowPlan;
};

function createTimeBlock(
  period: "morning" | "afternoon" | "evening",
  index: number,
  durationMinutes: number
): ShowPlanBlock {
  const periodConfig = {
    morning: {
      title: `晨间唤醒 ${index + 1}`,
      storyGoal: "轻松唤醒，伴随适合早晨的音乐",
      selectionGoal: "选择节奏适中、氛围温暖的音乐",
      episodeTargets: [
        { role: "opening-music" },
        { role: "bridge", durationMinutes: Math.floor(durationMinutes / 2) },
        { role: "closing-music" }
      ]
    },
    afternoon: {
      title: `午后时光 ${index + 1}`,
      storyGoal: "午后休闲，音乐伴随工作或休息",
      selectionGoal: "选择节奏稳定、适合专注或放松的音乐",
      episodeTargets: [
        { role: "opening-music" },
        { role: "bridge", durationMinutes: Math.floor(durationMinutes / 2) },
        { role: "closing-music" }
      ]
    },
    evening: {
      title: `晚间放松 ${index + 1}`,
      storyGoal: "结束一天，音乐帮助放松和沉淀",
      selectionGoal: "选择节奏舒缓、适合结束一天的曲目",
      episodeTargets: [
        { role: "opening-music" },
        { role: "bridge", durationMinutes: Math.floor(durationMinutes / 2) },
        { role: "closing-music" }
      ]
    }
  } as const;

  const config = periodConfig[period];

  return {
    role: period,
    title: config.title,
    storyGoal: config.storyGoal,
    selectionGoal: config.selectionGoal,
    sourceNeeds: [],
    constraints: {},
    episodeTargets: [...config.episodeTargets]
  };
}

export function createDailyShowPlanGenerator(): DailyShowPlanGenerator {
  return {
    generate(brief: ProgramBrief, options: DailyShowPlanGeneratorOptions = {}): ShowPlan {
      const now = new Date().toISOString();
      const {
        morningBlocks = 2,
        afternoonBlocks = 2,
        eveningBlocks = 2,
        totalDurationMinutes = 60
      } = options;

      const blocks: ShowPlanBlock[] = [];

      for (let i = 0; i < morningBlocks; i++) {
        blocks.push(createTimeBlock("morning", i, Math.floor(totalDurationMinutes / 6)));
      }
      for (let i = 0; i < afternoonBlocks; i++) {
        blocks.push(createTimeBlock("afternoon", i, Math.floor(totalDurationMinutes / 6)));
      }
      for (let i = 0; i < eveningBlocks; i++) {
        blocks.push(createTimeBlock("evening", i, Math.floor(totalDurationMinutes / 6)));
      }

      return {
        id: `plan-${randomUUID()}`,
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks,
        totalDurationMinutes,
        createdAt: now,
        updatedAt: now
      };
    }
  };
}
