import type { ProgramBrief, ProgramBriefType, ProgramBriefScope, ProgramBriefPriority } from "@fakeradio/shared";

export type ProductionIntent = {
  isProductionIntent: true;
  type: ProgramBriefType;
  topic: string;
  scope: ProgramBriefScope;
  priority: ProgramBriefPriority;
  targetBlockAt?: string | undefined;
};

export type ChatIntentResult = 
  | ProductionIntent
  | { isProductionIntent: false };

const THEME_SHOW_PATTERNS = [
  /(?:帮我?|给我)?做一[期个]围绕\s*(.+?)\s*(?:展开)?(?:的)?(?:主题)?节目/i,
  /(?:帮我?|给我)?做一[期个](.+?)主题节目/i,
  /(?:帮我?|给我)?来一[期个](.+?)主题节目/i,
  /(?:帮我?制作|制作)一[期个](.+?)(?:主题)?节目/i,
  /(?:帮我?|给我)?做一[期个](.+?)节目/i,
];

const BLOCK_THEME_PATTERNS = [
  /今晚(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /今夜(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /明早(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /明天早上(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /下午(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /中午(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
  /傍晚(?:想?听)?(.+?)(?:相关)?(?:的)?(?:东西|歌|音乐)?$/i,
];

const WEAK_EXPRESSION_PATTERNS = [
  /^(?:我喜欢|我爱|我超爱|我挺喜欢|我比较喜欢)/i,
  /^(?:最近在听|最近喜欢|最近迷上)/i,
  /^(?:推荐|来点|放点|播放)/i,
  /^(?:有点想听|想听点|想听)/i,
  /^(?:随便|随便来|随便放)/i,
];

function extractTopic(message: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim();
      if (topic.length > 0 && topic.length < 100) {
        return topic;
      }
    }
  }
  return null;
}

function isWeakExpression(message: string): boolean {
  const trimmed = message.trim();
  for (const pattern of WEAK_EXPRESSION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function inferBlockTime(message: string): string | undefined {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  
  if (/(?:今晚|今夜|晚上)/.test(message)) {
    return `${dateStr}T20:00:00.000Z`;
  }
  if (/(?:明早|明天早上)/.test(message)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.toISOString().split("T")[0]}T08:00:00.000Z`;
  }
  if (/(?:下午)/.test(message)) {
    return `${dateStr}T14:00:00.000Z`;
  }
  if (/(?:中午)/.test(message)) {
    return `${dateStr}T12:00:00.000Z`;
  }
  if (/(?:傍晚)/.test(message)) {
    return `${dateStr}T18:00:00.000Z`;
  }
  return undefined;
}

export function parseChatIntent(message: string): ChatIntentResult {
  const trimmed = message.trim();
  
  if (isWeakExpression(trimmed)) {
    return { isProductionIntent: false };
  }
  
  const themeShowTopic = extractTopic(trimmed, THEME_SHOW_PATTERNS);
  if (themeShowTopic) {
    return {
      isProductionIntent: true,
      type: "theme-show",
      topic: themeShowTopic,
      scope: "full-show",
      priority: "user-requested"
    };
  }
  
  const blockTopic = extractTopic(trimmed, BLOCK_THEME_PATTERNS);
  if (blockTopic) {
    const targetBlockAt = inferBlockTime(trimmed);
    return {
      isProductionIntent: true,
      type: "block-theme",
      topic: blockTopic,
      scope: "block",
      priority: "user-requested",
      targetBlockAt
    };
  }
  
  return { isProductionIntent: false };
}

export function createBriefFromIntent(
  intent: ProductionIntent,
  targetDate: string,
  createdFromMessageId?: string
): Omit<ProgramBrief, "id" | "createdAt" | "updatedAt"> {
  return {
    type: intent.type,
    topic: intent.topic,
    scope: intent.scope,
    targetDate,
    targetBlockAt: intent.targetBlockAt,
    priority: intent.priority,
    status: "draft",
    createdFromMessageId
  };
}
