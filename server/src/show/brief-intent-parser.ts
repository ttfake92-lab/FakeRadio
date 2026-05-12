import type { ProgramBrief, ProgramBriefType, ProgramBriefScope, ProgramBriefPriority } from "@fakeradio/shared";

export type ParsedBriefIntent = {
  isBriefIntent: true;
  type: ProgramBriefType;
  topic: string;
  scope: ProgramBriefScope;
  targetBlockAt?: string;
} | { isBriefIntent: false };

const THEME_SHOW_PATTERNS = [
  /帮我?做一期(.+?)主题节目/,
  /做一期关于(.+?)的节目/,
  /制作一期(.+?)主题的节目/,
  /生成一期(.+?)主题节目/,
  /帮我?制作(.+?)主题节目/
];

const BLOCK_THEME_PATTERNS = [
  /今晚想听(.+)/,
  /今晚听(.+)/,
  /晚上想听(.+)/,
  /今晚播放(.+)/,
  /今晚放(.+)/
];

export function parseBriefIntent(message: string, now: Date): ParsedBriefIntent {
  const trimmed = message.trim();

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
