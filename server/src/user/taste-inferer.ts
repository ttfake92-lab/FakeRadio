import { buildContextWindow } from "../context/context-builder.js";
import { readTaste, writeTaste } from "./taste-writer.js";
import { buildMockEnvironment } from "../utils/mock-environment.js";
import type { LlmAdapter } from "../adapters/types.js";
import type { UserPreferences } from "./load-user-preference.js";

export async function inferAndSaveTaste(options: {
  baseDir: string;
  llm: LlmAdapter;
  userPreferences: UserPreferences;
  sessionSummary: string;
  favList: string;
  userMessage: string;
}): Promise<string> {
  const { baseDir, llm, userPreferences, sessionSummary, favList, userMessage } = options;
  const currentTaste = await readTaste(baseDir);

  const inferFragments = buildContextWindow({
    now: new Date(),
    systemPrompt: `你是品味分析助手。根据用户今天的对话和收藏记录，分析其音乐品味偏好变化，生成更新后的品味文件（Markdown 格式）。\n\n当前品味：${currentTaste}\n\n今日对话：\n${sessionSummary}\n\n今日收藏：${favList || "无"}\n\n请输出更新后的完整品味文件内容。只输出品味文件内容，不要多余解释。`,
    userTaste: currentTaste,
    routines: userPreferences.routines,
    moodRules: userPreferences.moodRules,
    recentMemory: [],
    userMessage,
    toolResults: [],
    executionState: "taste inference",
    environment: buildMockEnvironment()
  });

  const inferredTaste = await llm.computeRaw(inferFragments);
  await writeTaste(baseDir, inferredTaste);
  return inferredTaste;
}
