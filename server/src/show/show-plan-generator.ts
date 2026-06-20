import type { ShowPlan, ProgramBrief, ShowPlanBlock, ShowPlanBlockConstraints } from "@fakeradio/shared";
import { ShowPlanBlockSchema } from "@fakeradio/shared";
import { randomUUID } from "node:crypto";
import type { LlmAdapter } from "../adapters/types.js";

export type ShowPlanGenerator = {
  generate(brief: ProgramBrief, taste?: string): Promise<ShowPlan>;
  generateFromPlan(existingPlan: ShowPlan, brief: ProgramBrief, additionalConstraints: ShowPlanBlockConstraints): Promise<ShowPlan>;
};

const BLOCK_GENERATION_SYSTEM_PROMPT = `你是一个专业的电台节目编排师。用户会给你一个节目主题和类型，你需要设计一个有叙事弧线的节目结构。

可用的节目段落角色（role）：
- opening: 开场引入
- origin: 起源与背景
- turning-point: 转折点
- signature-era: 标志性时代
- relationship: 合作与关系
- influence: 影响与传承
- contrast: 对比与反差
- personal-anchor: 个人锚点
- closing: 收尾与回味

你必须返回一个 JSON 对象，格式如下：
{
  "blocks": [
    {
      "role": "opening",
      "title": "段落标题",
      "storyGoal": "这段要讲什么故事",
      "selectionGoal": "选什么样的音乐",
      "sourceNeeds": [{"kind": "artist-bio", "description": "需要什么资料"}],
      "constraints": {"moodHint": "氛围关键词"},
      "episodeTargets": []
    }
  ],
  "totalDurationMinutes": 60
}

要求：
- blocks 数量 4-8 个，根据主题复杂度决定
- 第一个 block 必须是 opening，最后一个必须是 closing
- 每个 block 的 title 要具体、有画面感
- storyGoal 和 selectionGoal 要具体可执行
- sourceNeeds 的 kind 只能是：artist-bio, album-history, song-meaning, era-context, relationship-story, influence-link, cover-version, personal-memory
- 如果用户给了品味偏好，在 constraints.moodHint 中体现`;

const SHOW_PLAN_BLOCKS_SCHEMA_DESCRIPTION = `ShowPlanBlock 的 JSON schema：
{
  "role": "opening|origin|turning-point|signature-era|relationship|influence|contrast|personal-anchor|closing",
  "title": "string",
  "storyGoal": "string",
  "selectionGoal": "string",
  "sourceNeeds": [{"kind": "artist-bio|album-history|song-meaning|era-context|relationship-story|influence-link|cover-version|personal-memory", "description": "string"}],
  "constraints": {"preferEra": "string(optional)", "avoidExplicit": "boolean(optional)", "moodHint": "string(optional)"},
  "episodeTargets": [{"role": "opening-music|closing-music|bridge|solo(optional)", "durationMinutes": "number(optional)"}]
}`;

function buildUserPrompt(brief: ProgramBrief, taste?: string): string {
  const parts: string[] = [];
  parts.push(`节目类型：${brief.type === "theme-show" ? "主题节目" : brief.type === "block-theme" ? "时段主题" : "日常节目"}`);
  if (brief.topic) parts.push(`主题：${brief.topic}`);
  if (brief.constraints?.durationMinutes) parts.push(`时长：${brief.constraints.durationMinutes} 分钟`);
  if (brief.constraints?.moodHint) parts.push(`氛围偏好：${brief.constraints.moodHint}`);
  if (brief.constraints?.includeEra) parts.push(`偏好年代：${brief.constraints.includeEra}`);
  if (brief.constraints?.avoidExplicit) parts.push(`避免露骨内容`);
  if (taste) parts.push(`\n用户品味描述：\n${taste}`);
  return parts.join("\n");
}

export function createShowPlanGenerator(llm?: LlmAdapter): ShowPlanGenerator {
  async function generateWithLlm(brief: ProgramBrief, taste?: string): Promise<ShowPlanBlock[]> {
    if (!llm) throw new Error("No LLM adapter available");

    const userPrompt = buildUserPrompt(brief, taste);
    const result = await llm.computeJson<{ blocks: unknown[] }>(
      BLOCK_GENERATION_SYSTEM_PROMPT,
      userPrompt
    );

    if (!result || !Array.isArray(result.blocks) || result.blocks.length === 0) {
      throw new Error("LLM returned invalid show plan structure");
    }

    // Validate each block with Zod, fail fast if invalid
    const validatedBlocks: ShowPlanBlock[] = [];
    for (const block of result.blocks) {
      validatedBlocks.push(ShowPlanBlockSchema.parse(block));
    }
    return validatedBlocks;
  }

  return {
    async generate(brief: ProgramBrief, taste?: string): Promise<ShowPlan> {
      const now = new Date().toISOString();
      const blocks = await generateWithLlm(brief, taste);

      return {
        id: `plan-${randomUUID()}`,
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks,
        totalDurationMinutes: brief.constraints?.durationMinutes ?? 60,
        createdAt: now,
        updatedAt: now
      };
    },

    async generateFromPlan(
      existingPlan: ShowPlan,
      brief: ProgramBrief,
      additionalConstraints: ShowPlanBlockConstraints
    ): Promise<ShowPlan> {
      const now = new Date().toISOString();
      const newBlocks = existingPlan.blocks.map((block) => ({
        ...block,
        constraints: {
          ...block.constraints,
          ...additionalConstraints
        }
      }));

      return {
        id: existingPlan.id,
        briefId: existingPlan.briefId,
        version: existingPlan.version + 1,
        active: true,
        briefSnapshot: brief,
        blocks: newBlocks,
        totalDurationMinutes: existingPlan.totalDurationMinutes ?? 60,
        createdAt: existingPlan.createdAt,
        updatedAt: now
      };
    }
  };
}
