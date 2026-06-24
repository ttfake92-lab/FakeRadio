import type { LlmAdapter } from "../adapters/types.js";

// 节目主题分类。
//
// 编排节目时,用户给的主题可能是:
//   - "陈奕迅" / "Queen"        -> artist  (必须保证选歌的歌手名 = 这个人)
//   - "OK Computer"             -> album   (必须保证选歌出自这张专辑或这位艺术家)
//   - "粤语金曲" / "Britpop"     -> style   (artist 不要求匹配, 风格大致符合就行)
//   - "周末微醺" / "深夜伤感"     -> mood    (跟 style 同样宽松, artist 不约束)
//   - "随便放点"                 -> none    (基本退化成 favorites 选歌)
//
// 不同类型用不同的选歌策略:
//   artist/album -> 候选歌曲必须 artist 字段命中 anchors 之一,否则丢弃
//   style/mood   -> 把 anchors 当查询前缀辅助召回, 不做 artist 硬过滤
//   none         -> 退化到原 fallback (favorites + block selectionGoal)

export type ShowTopicKind = "artist" | "album" | "style" | "mood" | "none";

export type ShowTopicClassification = {
  kind: ShowTopicKind;
  // 用于选歌的"锚定关键词":artist 类型下是艺术家名 (含别名/英文名),
  // style/mood 下是风格描述词。kind=none 时为空数组。
  anchors: string[];
};

const SYSTEM_PROMPT = `你是音乐编辑助手。给你一个"电台节目主题"字符串,判断它是哪种类型:
- artist: 单个或少数几个具体艺术家/乐队 (例: "陈奕迅", "Queen", "周杰伦", "李宗盛+林夕")
- album: 具体专辑名 (例: "OK Computer", "Random Access Memories")
- style: 音乐风格/流派 (例: "粤语金曲", "Britpop", "post-rock", "City Pop")
- mood: 氛围/场景 (例: "周末微醺", "深夜伤感", "通勤上班", "雨天")
- none: 太宽泛或没意义 (例: "随便", "音乐", "好听的歌")

输出严格 JSON:
{
  "kind": "artist" | "album" | "style" | "mood" | "none",
  "anchors": string[]   // 对 artist/album 给艺术家名 (中英文别名都写上, 比如 ["陈奕迅","Eason Chan"]);
                        // 对 style/mood 给 2-4 个搜索友好的关键词 (中英文搜索都能用);
                        // 对 none 给 []
}

关键: artist 类型时, anchors 是艺术家本人, 不要把"专辑名"或"歌名"塞进来; 想唱 Queen 的人就要 Queen, 不要 "波西米亚狂想曲"。`;

type RawClassification = {
  kind?: unknown;
  anchors?: unknown;
};

const VALID_KINDS: readonly ShowTopicKind[] = ["artist", "album", "style", "mood", "none"];

function parseClassification(raw: unknown): ShowTopicClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawClassification;
  const kind = typeof r.kind === "string" && (VALID_KINDS as readonly string[]).includes(r.kind)
    ? (r.kind as ShowTopicKind)
    : null;
  if (!kind) return null;
  const anchors = Array.isArray(r.anchors)
    ? r.anchors
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .map((a) => a.trim())
    : [];
  return { kind, anchors };
}

export async function classifyShowTopic(
  llm: LlmAdapter,
  topic: string | undefined
): Promise<ShowTopicClassification> {
  const safeTopic = (topic ?? "").trim();
  if (!safeTopic) return { kind: "none", anchors: [] };

  try {
    const raw = await llm.computeJson<unknown>(SYSTEM_PROMPT, `[主题]\n${safeTopic}`);
    const parsed = parseClassification(raw);
    if (parsed) return parsed;
    console.warn(`[topic-classify] LLM returned invalid classification for "${safeTopic}", raw=${JSON.stringify(raw).slice(0, 200)}`);
  } catch (err) {
    console.warn(`[topic-classify] failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // LLM 失败或输出格式不对时: 退化成 none, 不做硬过滤、不强行把主题当艺术家。
  // 比"猜成 artist"安全 -- 用户主题里 "粤语金曲" 这种风格词被强行当成艺术家会把整期搞砸,
  // 退成 none 至少能让原 fallback 选歌跑起来,节目内容可能弱化但不会全错。
  return { kind: "none", anchors: [] };
}

// 导出供测试用
export const __internals = { parseClassification, SYSTEM_PROMPT };
