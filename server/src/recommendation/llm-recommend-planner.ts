import type { Track } from "@fakeradio/shared";
import type { LlmAdapter } from "../adapters/types.js";
import type { UserPreferences } from "../user/load-user-preference.js";

// LLM 驱动的推荐规划器。
//
// 它干两件事:
// 1) 判断用户消息是不是"找歌/换风格/换氛围"意图(intent)
// 2) 命中后,看完整上下文(画像/taste/收藏/历史/当前曲目)生成具体搜索词
//
// 关键: 不做关键词字典,不维护硬编码艺术家列表。LLM 已经知道哪些人是"摇滚"
// 哪些人是"伤感",我们把上下文塞给它,让它输出符合"你"的搜索词。
// 这比 detectStyleSwitchIntent(...) 那种字典正则更聪明,因为它能:
//   - 用户说"换风格"→ 看当前播的是什么,自动决定换到什么风格
//   - 用户说"昨天那种感觉"→ 看聊天历史
//   - "更冷一点"/"再硬核一点"→ 这种相对意图字典根本写不完
//   - 用户 taste 是经典摇滚 → 给他 Pink Floyd/Queen 而不是 nu metal
//
// 失败处理: 任何环节出错(LLM 超时/解析失败/返回空)直接返回 null,
// 调用方落回原 LLM 流程,保证用户至少能收到一句话回复。

export type LlmRecommendPlan = {
  /** LLM 给的 DJ 说辞,可空(空时由调用方自己拼)。 */
  say: string;
  /** 具体的搜索词列表,按命中率优先级排好。后端会按顺序 search。 */
  queries: string[];
  /** LLM 主动建议要避开的艺术家/歌名片段(基于历史最近推过的)。 */
  avoid: string[];
};

export type PlanRecommendInput = {
  llm: LlmAdapter;
  /** 用户原话。 */
  userMessage: string;
  /** 当前正在播的曲目;LLM 用来理解"换一个/再来类似的"。 */
  currentTrack: Track | null;
  /** 用户的长期画像(profile.md)。 */
  profile: string;
  /** 用户的口味描述(taste.md)。 */
  taste: string;
  /** 用户作息(routines.md)。 */
  routines: string;
  /** 用户的收藏(取 top N 名字 + 艺术家,够 LLM 知道你"听什么"就行)。 */
  likedSongs: Track[];
  /** 最近的聊天历史(用户与 DJ 双方),让 LLM 看"上下文"。 */
  recentChat: string[];
  /** 最近推过/播过的艺术家,LLM 自己决定要不要避开。 */
  recentArtists: string[];
};

// LLM 输出 schema(给提示词用,也用于解析容错):
// {
//   isMusicRequest: true,                // 是不是"找歌"意图
//   say: "好,给你换一批迷幻摇滚",         // DJ 说辞
//   queries: ["Pink Floyd", "Tame Impala", ...],  // 5-8 个,具体艺术家或歌名
//   avoid: ["Queen", "Bohemian Rhapsody"]  // 可空
// }

const SYSTEM_PROMPT = `你是一档个人电台的 DJ 助手。任务: 把用户的找歌请求翻译成具体的搜索词列表。

输出严格 JSON,字段如下:
{
  "isMusicRequest": boolean,   // 用户是不是明确想"找新歌/换歌/听新风格"? 关于当前曲目的提问 = false
  "say": string,               // 1-2 句中文,自然的 DJ 口吻回复,告诉用户你给挑了什么方向(<=40 字,无表情,无前缀)
  "queries": string[],         // 5-8 个搜索词,网易云能搜到的具体艺术家名或歌曲名(中英文均可),按命中率排序
  "avoid": string[]            // 可选;若用户说"别推 X"或最近重复推过太多次,把要避开的艺术家/歌名放这里
}

isMusicRequest 判断标准(只在用户明确想"换/找/加"新歌时为 true):
- true: "想听摇滚"/"换一首"/"来点伤感的"/"给我推荐Queen"/"再硬核一点"/"昨天那种感觉"/"嗨一点"/"降速"/"安静一点"
- false: "你好"/"今天天气怎么样"/"DJ 是男是女"/"我累了想睡了"(纯闲聊)
- false: "讲讲这首歌"/"介绍一下"/"这歌哪一年的"/"这是谁唱的"/"这首叫什么"/"什么意思"
       (关于"当前正在播"的提问——用户只想要解释/故事,不想换歌)
- false: "好听"/"不错"/"喜欢"/"挺棒"/"感动"(对当前曲目的情绪反馈,不想换)
- false: 任何对前一轮 DJ 回复的肯定/否定/追问("是吗"/"哦"/"详细点"等)

关键: isMusicRequest=false 时,queries 必须返回 [] 空数组;只有 true 时才填 queries。
宁可错判为 false 让用户多说一次,也不要在用户问"讲讲"时硬塞推荐,那会让对话很莫名其妙。

关于 queries 的硬要求(仅 isMusicRequest=true 时适用):
- 必须是具体的"艺术家名"或"歌曲名",不能是"摇滚"/"安静一点"这种风格词(网易云字面搜风格词只返回歌名带这俩字的杂歌,搜不到代表作)
- 至少 5 个、最多 8 个,确保有候选可挑
- 要结合用户画像/收藏/最近播放: 如果用户说"想听摇滚",看他平时听 Pink Floyd 还是听 Nirvana,给对应方向;不要给他从没听过的冷门
- 若用户已经收藏过某艺术家,推荐时倾向"同艺术家的其他歌"或"风格相邻的另一位",而不是反复推同一个人
- 用户消息里出现的引号/书名号/明确艺术家名(如 "Queen"/"Pink Floyd"/"巴拉莱卡")必须放进 queries 前两位
- 若用户最近 N 次推荐里反复出现同一艺术家(看 recentArtists),主动从其他风格相邻艺术家选,放到 avoid`;

function buildUserPrompt(input: PlanRecommendInput): string {
  const lines: string[] = [];
  lines.push(`[用户消息]\n${input.userMessage}`);

  if (input.profile.trim()) {
    lines.push(`\n[用户画像]\n${input.profile.trim()}`);
  }
  if (input.taste.trim()) {
    lines.push(`\n[音乐口味]\n${input.taste.trim()}`);
  }
  if (input.routines.trim()) {
    lines.push(`\n[作息节奏]\n${input.routines.trim()}`);
  }

  if (input.currentTrack) {
    const t = input.currentTrack;
    lines.push(`\n[当前正在播]\n${t.title} - ${t.artist}${t.album ? `(${t.album})` : ""}`);
  }

  if (input.likedSongs.length > 0) {
    // 取前 30 首; 太多 LLM 抓不住重点。按艺术家去重展示, 让 LLM 看到"你听这些人"。
    const seen = new Set<string>();
    const lines2: string[] = [];
    for (const t of input.likedSongs) {
      if (lines2.length >= 30) break;
      const key = `${t.artist}::${t.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines2.push(`- ${t.title} - ${t.artist}`);
    }
    lines.push(`\n[最近收藏的歌(${lines2.length} 首,作为口味参考)]\n${lines2.join("\n")}`);
  }

  if (input.recentArtists.length > 0) {
    lines.push(`\n[最近推荐过/播过的艺术家(尽量错开避免重复)]\n${input.recentArtists.join(", ")}`);
  }

  if (input.recentChat.length > 0) {
    lines.push(`\n[最近的对话(理解上下文用,如 "刚才那个"/"再来一首类似的")]\n${input.recentChat.slice(-8).join("\n")}`);
  }

  return lines.join("\n");
}

type RawPlan = {
  isMusicRequest?: unknown;
  say?: unknown;
  queries?: unknown;
  avoid?: unknown;
};

function parsePlan(raw: unknown): LlmRecommendPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawPlan;
  if (r.isMusicRequest !== true) return null;
  const queries = Array.isArray(r.queries)
    ? r.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0).map((q) => q.trim())
    : [];
  if (queries.length === 0) return null;
  const avoid = Array.isArray(r.avoid)
    ? r.avoid.filter((q): q is string => typeof q === "string" && q.trim().length > 0).map((q) => q.trim())
    : [];
  const say = typeof r.say === "string" ? r.say.trim() : "";
  return { say, queries, avoid };
}

export async function planLlmRecommendation(input: PlanRecommendInput): Promise<LlmRecommendPlan | null> {
  try {
    const userPrompt = buildUserPrompt(input);
    const raw = await input.llm.computeJson<unknown>(SYSTEM_PROMPT, userPrompt);
    return parsePlan(raw);
  } catch (err) {
    console.warn(`[llm-plan] failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// 导出供测试用
export const __internals = { buildUserPrompt, parsePlan, SYSTEM_PROMPT };
