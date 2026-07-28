import { buildContextWindow } from "../context/context-builder.js";
import { readTaste, writeTaste } from "./taste-writer.js";
import type { LlmAdapter } from "../adapters/types.js";
import type { UserPreferences } from "./load-user-preference.js";

export async function inferAndSaveTaste(options: {
  baseDir: string;
  llm: LlmAdapter;
  userPreferences: UserPreferences;
  sessionSummary: string;
  favList: string;
  /** 今日明确不喜欢的曲目摘要;负反馈信号,让品味文件自动长出雷区段落 */
  dislikeList?: string;
  userMessage: string;
}): Promise<string> {
  const { baseDir, llm, userPreferences, sessionSummary, favList, dislikeList, userMessage } = options;
  const currentTaste = await readTaste(baseDir);

  const inferFragments = buildContextWindow({
    now: new Date(),
    systemPrompt: `你是品味分析助手。根据用户今天的对话、收藏和不喜欢记录，分析其音乐品味偏好变化，生成更新后的品味文件（Markdown 格式）。\n\n当前品味：${currentTaste}\n\n今日对话：\n${sessionSummary}\n\n今日收藏：${favList || "无"}\n\n今日不喜欢：${dislikeList || "无"}\n\n不喜欢是明确的负反馈：如果同类风格/艺术家被多次不喜欢，在品味文件中记入"雷区"段落（附次数与日期）；单次不喜欢只记录事实，不要扩大为整个风格的否定。请输出更新后的完整品味文件内容。只输出品味文件内容，不要多余解释。`,
    userTaste: currentTaste,
    routines: userPreferences.routines,
    moodRules: userPreferences.moodRules,
    recentMemory: [],
    userMessage,
    toolResults: [],
    executionState: "taste inference",
    environment: {
      weather: { summary: "weather provider disabled", moodHint: "" },
      calendar: [],
      devices: [{ id: "local-browser", name: "Local Browser", kind: "browser", status: "available" }]
    }
  });

  const inferredTaste = await llm.computeRaw(inferFragments);
  await writeTaste(baseDir, inferredTaste);
  return inferredTaste;
}
