import type { ShowPlan, ProgramBrief, ShowPlanBlock } from "@fakeradio/shared";
import { randomUUID } from "node:crypto";

export type ShowPlanGenerator = {
  generate(brief: ProgramBrief): Promise<ShowPlan>;
};

export function createShowPlanGenerator(): ShowPlanGenerator {
  function generateMockBlocks(topic: string): ShowPlanBlock[] {
    const baseBlocks: ShowPlanBlock[] = [
      {
        role: "opening",
        title: `开场：${topic} 的声音`,
        storyGoal: "介绍主题，营造氛围",
        selectionGoal: "选择一首最具代表性的开场曲",
        sourceNeeds: [],
        constraints: {},
        episodeTargets: []
      },
      {
        role: "origin",
        title: "起源与背景",
        storyGoal: "讲述主题的起源故事",
        selectionGoal: "选择体现早期风格的曲目",
        sourceNeeds: [
          { kind: "artist-bio", description: "艺人的早期背景" }
        ],
        constraints: {},
        episodeTargets: []
      },
      {
        role: "signature-era",
        title: "标志性时代",
        storyGoal: "展示最辉煌的时期",
        selectionGoal: "选择多首经典热门曲目",
        sourceNeeds: [
          { kind: "era-context", description: "时代背景" },
          { kind: "album-history", description: "经典专辑" }
        ],
        constraints: {},
        episodeTargets: []
      },
      {
        role: "closing",
        title: "收尾与回味",
        storyGoal: "留下深刻印象的结尾",
        selectionGoal: "选择一首余音绕梁的收尾曲",
        sourceNeeds: [],
        constraints: {},
        episodeTargets: []
      }
    ];

    const optionalBlocks: ShowPlanBlock[] = [
      {
        role: "turning-point",
        title: "转折点",
        storyGoal: "讲述风格转变的关键节点",
        selectionGoal: "选择体现风格转变的曲目",
        sourceNeeds: [
          { kind: "relationship-story", description: "风格转变的背景" }
        ],
        constraints: {},
        episodeTargets: []
      },
      {
        role: "influence",
        title: "影响与传承",
        storyGoal: "展示对后世的影响",
        selectionGoal: "选择受其影响的相关曲目",
        sourceNeeds: [
          { kind: "influence-link", description: "影响关系" }
        ],
        constraints: {},
        episodeTargets: []
      },
      {
        role: "relationship",
        title: "合作与关系",
        storyGoal: "讲述与其他艺人的合作",
        selectionGoal: "选择合作曲目",
        sourceNeeds: [
          { kind: "relationship-story", description: "合作关系" }
        ],
        constraints: {},
        episodeTargets: []
      }
    ];

    const shuffledOptional = [...optionalBlocks].sort(() => Math.random() - 0.5);
    const extraCount = Math.floor(Math.random() * 5); // 0-4 extra blocks

    const blocks = [
      baseBlocks[0],
      ...shuffledOptional.slice(0, extraCount),
      ...baseBlocks.slice(1, 3),
      baseBlocks[3]
    ].filter((b): b is ShowPlanBlock => b !== undefined);

    return blocks.slice(0, 8); // Ensure max 8 blocks
  }

  return {
    async generate(brief: ProgramBrief): Promise<ShowPlan> {
      const now = new Date().toISOString();
      const blocks = generateMockBlocks(brief.topic || "Theme");

      return {
        id: `plan-${randomUUID()}`,
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks,
        totalDurationMinutes: 60,
        createdAt: now,
        updatedAt: now
      };
    }
  };
}
