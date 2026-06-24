import type { ProgramBrief, ProgramBriefType, ProgramBriefScope, ProgramBriefPriority } from "@fakeradio/shared";
import type { LlmAdapter } from "../adapters/types.js";

export type ParsedBriefIntent = {
  isBriefIntent: true;
  type: ProgramBriefType;
  topic: string;
  scope: ProgramBriefScope;
  targetBlockAt?: string;
} | { isBriefIntent: false };

// Fast regex patterns — zero latency for explicit requests
//
// 设计原则: 用户说"做 X 的节目"/"做一期 X"/"X 主题节目" 这类句式都是明确的编排意图,
// 不依赖 LLM 二次判断。LLM 在边界 case 会把"做陈奕迅的节目"当成"想听陈奕迅"。
const THEME_SHOW_PATTERNS = [
  // 显式带"主题"字样: 兼容最早的写法
  /帮我?做一期(.+?)主题节目/,
  /做一期关于(.+?)的节目/,
  /制作一期(.+?)主题的节目/,
  /生成一期(.+?)主题节目/,
  /帮我?制作(.+?)主题节目/,
  // 不带"主题"字样: "做陈奕迅的节目" / "做一期陈奕迅" / "想做一期 X 的节目"
  /(?:我?想?要?)?做(?:一期)?(.+?)的?节目$/,
  /(?:我?想?要?)?做一期(.+?)(?:的节目)?$/,
  // 编排/策划/制作动词的等价说法
  /(?:策划|安排|编排|制作)一期(?:关于)?(.+?)的?节目$/,
  /(?:策划|安排|编排|制作)(?:一期)?(.+?)节目$/
];

const BLOCK_THEME_PATTERNS = [
  /今晚安排一期(.+)/,
  /今晚做一期(.+)/,
  /晚上安排一期(.+)/,
  /晚上做一期(.+)/
];

const INTENT_DETECTION_SYSTEM_PROMPT = `你是一个电台节目意图识别器。判断用户的消息是否隐含着"想做一期节目"的意图。

返回 JSON：
{
  "isBriefIntent": true/false,
  "type": "theme-show" 或 "block-theme",
  "topic": "节目主题（如果有的话）",
  "scope": "full-show" 或 "block"
}

判断规则：
- 如果用户明确说要"做节目"、"策划一期"、"制作一期"、"帮我安排一期"等 → isBriefIntent: true
- 如果用户只是描述音乐偏好或点歌，如"最近在听很多后摇"、"想听点爵士"、"来点 City Pop" → isBriefIntent: false
- 如果用户说"今晚安排一期xxx"、"今晚做一期xxx" → isBriefIntent: true, type: "block-theme"
- 如果用户只是日常聊天、问天气、说感受 → isBriefIntent: false
- 不确定时 → isBriefIntent: false

只返回 JSON，不要其他文字。`;

export function parseBriefIntent(message: string, now: Date): ParsedBriefIntent {
  const trimmed = message.trim();

  // Fast path: regex matching
  for (const pattern of THEME_SHOW_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim();
      return {
        isBriefIntent: true,
        type: "theme-show",
        topic,
        scope: "full-show"
      };
    }
  }

  for (const pattern of BLOCK_THEME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim();
      const tonight = new Date(now);
      tonight.setHours(20, 0, 0, 0);
      return {
        isBriefIntent: true,
        type: "block-theme",
        topic,
        scope: "block",
        targetBlockAt: tonight.toISOString()
      };
    }
  }

  return { isBriefIntent: false };
}

/**
 * LLM-powered intent detection — called when regex doesn't match.
 * More expensive (1-3s) but catches natural language like "最近在听很多后摇".
 */
export async function parseBriefIntentWithLlm(
  message: string,
  now: Date,
  llm: LlmAdapter
): Promise<ParsedBriefIntent> {
  try {
    const result = await llm.computeJson<{
      isBriefIntent: boolean;
      type?: string;
      topic?: string;
      scope?: string;
    }>(INTENT_DETECTION_SYSTEM_PROMPT, message);

    if (!result.isBriefIntent || !result.topic) {
      return { isBriefIntent: false };
    }

    const type: ProgramBriefType =
      result.type === "block-theme" ? "block-theme" : "theme-show";
    const scope: ProgramBriefScope =
      type === "block-theme" ? "block" : "full-show";

    const intent: ParsedBriefIntent = {
      isBriefIntent: true,
      type,
      topic: result.topic,
      scope
    };

    if (type === "block-theme") {
      const tonight = new Date(now);
      tonight.setHours(20, 0, 0, 0);
      intent.targetBlockAt = tonight.toISOString();
    }

    return intent;
  } catch {
    // LLM failed — treat as no intent
    return { isBriefIntent: false };
  }
}

export function createBriefFromIntent(
  intent: Extract<ParsedBriefIntent, { isBriefIntent: true }>,
  targetDate: string,
  priority: ProgramBriefPriority
): ProgramBrief {
  const now = new Date().toISOString();
  return {
    id: `brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: intent.type,
    topic: intent.topic,
    scope: intent.scope,
    targetDate,
    targetBlockAt: intent.targetBlockAt,
    priority,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}
