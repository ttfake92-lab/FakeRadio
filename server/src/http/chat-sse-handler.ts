import type { Track } from "@fakeradio/shared";
import type { RegisterRoutesDeps } from "./types.js";
import { handleShowProgrammingIntent } from "./chat-intent-router.js";

export type ChatDonePayload = {
  text: string;
  action?: {
    type: "next-track" | "add-favorite" | "show-brief-created" | "show-plan-refined" | "show-confirmed" | "show-cancelled" | string;
    trackId?: string;
    title?: string;
    artist?: string;
    briefId?: string;
    tracks?: Track[];
  };
};

export type SSEEmitter = {
  emit(event: "chunk" | "done", data: string | ChatDonePayload): void;
};

export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  const sentences: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (/[。！？.!?]/.test(char)) {
      const trimmed = current.trim();
      if (trimmed) sentences.push(trimmed);
      current = "";
    }
  }
  if (current.trim()) {
    const trimmed = current.trim();
    if (trimmed) sentences.push(trimmed);
  }
  return sentences;
}

function uniqueQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = (v ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

// 从用户消息里抽出明确的实体名(艺术家/歌曲/专辑),作为最强搜索种子。
// 规则:
// 1) 引号/书名号里的内容 — 用户明确点名("放 Pink Floyd 的《Wish You Were Here》")
// 2) 多词英文专有名词(连续 2+ 个首字母大写词,或单大写词带空格)— "Pink Floyd"/"Led Zeppelin"
// 3) extractTasteKeywords 命中的风格簇里夹带的艺术家名(如 "Pink Floyd"/"Sigur Rós")
// 单个常见英文单词(jazz/rock/focus)不算实体,留给 playQuery 处理。
export function extractMentionedEntities(
  message: string,
  extractTasteKeywords: (text: string) => string[]
): string[] {
  const entities: string[] = [];

  // 1) 引号 / 书名号 / 方括号里的内容
  const quoted = message.match(/[《【「『"'\[].+?[》】」』"'\]]/g) ?? [];
  for (const q of quoted) {
    const inner = q.slice(1, -1).trim();
    if (inner) entities.push(inner);
  }

  // 2) 连续 2+ 个首字母大写词(如 "Pink Floyd", "Led Zeppelin", "Sigur Rós")。
  // 用 \p{L} 覆盖非 ASCII 字母(ó/é/ü 等),避免漏掉 Sigur Rós 这类带变音符的艺术家名。
  const multiWord = message.match(/\b[A-Z\p{Lu}][\p{L}]+(?:\s+[A-Z\p{Lu}][\p{L}]+)+\b/gu) ?? [];
  entities.push(...multiWord);

  // 3) extractTasteKeywords 命中的字符串本身也可能含艺术家名(它返回的 keyword 不一定是风格词,
  //    例如用户写 "Sigur Rós" 时它返回 "Sigur Rós")。把命中关键词里带空格或非 ASCII 的当实体。
  for (const kw of extractTasteKeywords(message)) {
    if (/\s/.test(kw) || /[^\x00-\x7F]/.test(kw)) {
      entities.push(kw);
    }
  }

  return uniqueQueries(entities);
}

export type ChatSSEHandlerDeps = Pick<
  RegisterRoutesDeps,
  | "llm"
  | "userPreferences"
  | "state"
  | "sessionRepo"
  | "trackRegistry"
  | "audioDir"
  | "exportDir"
  | "tts"
  | "ttsCacheDir"
  | "music"
  | "weather"
  | "calendar"
  | "devices"
  | "storySource"
  | "publicMetadataAdapter"
  | "webResearchAdapter"
  | "currentMoodHint"
  | "nowProvider"
  | "systemPrompt"
  | "favorites"
  | "likedSongs"
  | "memory"
  | "musicStatus"
  | "programBriefRepo"
  | "showPlanRepo"
  | "showPlanGenerator"
  | "stream"
  | "stateRepo"
>;

// Reuse the same show programming logic from chat-intent-router
async function tryHandleShowIntent(
  message: string,
  deps: ChatSSEHandlerDeps,
  emitter: SSEEmitter
): Promise<boolean> {
  const result = await handleShowProgrammingIntent(message, deps);
  if (!result) return false;

  const sentences = splitIntoSentences(result.message);
  for (const sentence of sentences) {
    emitter.emit("chunk", sentence);
  }
  const donePayload: ChatDonePayload = { text: result.message };
  if (result.action !== undefined) {
    const action: NonNullable<ChatDonePayload["action"]> = { type: result.action.type };
    if (result.action.trackId !== undefined) action.trackId = result.action.trackId;
    if (result.action.title !== undefined) action.title = result.action.title;
    if (result.action.artist !== undefined) action.artist = result.action.artist;
    if (result.action.briefId !== undefined) action.briefId = result.action.briefId;
    donePayload.action = action;
  }
  emitter.emit("done", donePayload);
  return true;
}

export function buildChatSSEHandler(deps: ChatSSEHandlerDeps) {
  return async function handleChatSSE(
    message: string,
    emitter: SSEEmitter
  ): Promise<void> {
    const { computeDjDecision } = await import("../brain/dj-brain.js");
    const { ChatRequestSchema } = await import("@fakeradio/shared");

    const msg = ChatRequestSchema.parse({ message }).message.trim();
    const currentTrack = deps.state.getCurrentTrack();
    const now = new Date();

    // Save user message to session
    const userEntry: { timestamp: string; role: "user"; text: string; trackId?: string } = {
      timestamp: now.toISOString(),
      role: "user",
      text: msg
    };
    if (currentTrack) userEntry.trackId = currentTrack.id;
    await deps.sessionRepo.appendMessage(userEntry);

    // Load recent memory for context: 双方都收，否则 LLM 看不到用户上一轮说了什么，
    // 多轮对话就会断片（用户说"换 jazz"→ DJ 答"好"→ 用户说"可以"→ DJ 不知道"可以"是同意什么）。
    const todaySession = await deps.sessionRepo.getToday();
    const recentMemory = todaySession
      .filter((e) => e.role === "user" || e.role === "agent")
      .slice(-10)
      .map((e) => `[${e.role === "user" ? "USER" : "DJ"}] ${e.text}`);

    // Intent: next-track
    if (/^(下一首|next|切歌|换一首)/i.test(msg)) {
      const text = "正在切歌...";
      emitter.emit("chunk", text);

      emitter.emit("done", {
        text,
        action: { type: "next-track" },
      });
      return;
    }

    // Intent: add-favorite
    if (/^(收藏|喜欢这首歌|加入收藏|fav)/i.test(msg) && currentTrack) {
      const text = `已收藏《${currentTrack.title}》`;
      emitter.emit("chunk", text);

      await deps.favorites.save({
        trackId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album
      });

      await deps.sessionRepo.appendMessage({
        timestamp: new Date().toISOString(),
        role: "agent",
        text,
        trackId: currentTrack.id
      });

      emitter.emit("done", {
        text,
        action: {
          type: "add-favorite",
          trackId: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
        },
      });
      return;
    }

    // Intent: show programming (LLM-powered)
    // 意图检测内部也走 LLM，失败时按"不是编排意图"处理，
    // 不能让它把普通聊天一起带崩
    try {
      const handled = await tryHandleShowIntent(msg, deps, emitter);
      if (handled) return;
    } catch {
      // fall through to default chat path
    }

    // Intent: 找歌/换风格(LLM 主导)。
    //
    // 不再用关键词字典 + 硬编码代表艺术家——那种方式有两个死穴:
    //   1) 字典覆盖不到"再硬核一点"/"昨天那种感觉"/"伤感但不致郁"这种相对意图
    //   2) 固定艺术家列表导致"每次说摇滚都是同一批人"
    //
    // 改为让 LLM 看完整上下文(画像+taste+收藏+最近播放+当前曲目+聊天历史)
    // 直接输出 5-8 个具体艺术家/歌名,后端无脑 search。
    // LLM 自己负责"看你听 Pink Floyd 不听 Nirvana,推 Pink Floyd 方向"以及
    // "最近推过 Queen,这次给 The Beatles" 这种动态决策。
    try {
      const { planLlmRecommendation } = await import("../recommendation/llm-recommend-planner.js");
      const [recentPlayed, likedSongTracks] = await Promise.all([
        deps.stateRepo.getRecentlyPlayed(20).catch(() => []),
        deps.likedSongs.list().catch(() => [])
      ]);
      // 给 LLM "最近接触过的艺术家"列表,让它自己决定要不要避开重复。
      const recentArtistsSet = new Set<string>();
      for (const t of recentPlayed) {
        if (t.artist) recentArtistsSet.add(t.artist);
      }
      const recentArtists = [...recentArtistsSet].slice(0, 15);

      const plan = await planLlmRecommendation({
        llm: deps.llm,
        userMessage: msg,
        currentTrack,
        profile: deps.userPreferences.profile,
        taste: deps.userPreferences.taste,
        routines: deps.userPreferences.routines,
        likedSongs: likedSongTracks,
        recentChat: recentMemory,
        recentArtists
      });

      if (plan) {
        const { selectRecommendedCandidates } = await import("../recommendation/recommendation-engine.js");
        const { buildTodayPlan, getCurrentPlanBlock } = await import("../scheduler/radio-scheduler.js");
        const queue = deps.state.getQueue();
        // 排除已播 + 当前 + 已入队 + LLM 主动说要避开的。
        // avoid 是 LLM 看上下文后给的"这次别推"列表(用户说"别再来 X"或最近重复推过)。
        // avoid 是名字片段(artist 或 title),作为字符串包含匹配。
        const avoidLower = plan.avoid.map((a) => a.toLowerCase());
        const excluded = new Set([
          ...deps.state.getRecentlySelectedTrackIds(),
          ...(currentTrack ? [currentTrack.id] : []),
          ...queue.map((t) => t.id)
        ]);
        const currentPlan = buildTodayPlan(now, deps.userPreferences.playlists);
        const currentBlock = getCurrentPlanBlock(currentPlan, now) ?? {
          at: "runtime",
          label: "对话推荐",
          moodHint: deps.currentMoodHint
        };
        // context 用最简骨架——风格切换场景下 weather/calendar 都是噪音,
        // LLM 已经把"该听什么"压缩到 queries 里了。
        const context = {
          now,
          block: currentBlock,
          weather: { summary: "unknown", moodHint: "neutral" },
          calendar: [],
          userPreferences: deps.userPreferences,
          likedSongs: likedSongTracks,
          recentTrackIds: excluded,
          queuedTrackIds: new Set(queue.map((t) => t.id)),
          excludedTrackIds: excluded,
          seedTracks: [],
          queries: plan.queries,
          signals: [],
          intent: {
            priority: "curated-radio" as const,
            energy: "medium" as const,
            daypart: currentBlock.label,
            weatherMood: "neutral"
          }
        };

        const rawCandidates = await selectRecommendedCandidates({
          music: deps.music,
          context,
          limit: 8,        // 多拉一点,避开 avoid 后还能剩 5 首
          searchOnly: true // 跳过 /simi/song,它是基于"当前喜好"的反向信号
        });
        // 应用 avoid 过滤(LLM 告诉我们要避开的)
        const filtered = avoidLower.length === 0
          ? rawCandidates
          : rawCandidates.filter((c) => {
              const sig = `${c.track.title} ${c.track.artist}`.toLowerCase();
              return !avoidLower.some((a) => sig.includes(a));
            });
        const candidates = filtered.slice(0, 5);

        if (candidates.length === 0) {
          // LLM 给的 queries 全没搜到结果——告诉用户,引导报具体名字。
          const fallbackText = plan.say
            ? `${plan.say}不过没找到合适的,要不直接报个歌名或歌手名?`
            : `没找到合适的,要不直接报个歌名或歌手名?`;
          emitter.emit("chunk", fallbackText);
          await deps.sessionRepo.appendMessage({
            timestamp: new Date().toISOString(),
            role: "agent",
            text: fallbackText,
            ...(currentTrack ? { trackId: currentTrack.id } : {})
          });
          emitter.emit("done", { text: fallbackText });
          return;
        }

        const suggestions = candidates.map((c) => c.track);
        // 用 LLM 给的 say,不再硬编码"好,给你换一批X方向的"——
        // LLM 知道用户上下文,能说得更自然。
        const intro = plan.say || "我给你挑了几首。";
        const suggestText = `${intro} ${suggestions.map((t) => `《${t.title}》`).join("、")}。点一首我插到下一首。`;
        emitter.emit("chunk", suggestText);

        const action: NonNullable<ChatDonePayload["action"]> = {
          type: "track-suggestion",
          tracks: suggestions
        };
        await deps.sessionRepo.appendMessage({
          timestamp: new Date().toISOString(),
          role: "agent",
          text: suggestText,
          ...(currentTrack ? { trackId: currentTrack.id } : {})
        });
        emitter.emit("done", { text: suggestText, action });
        return;
      }
      // plan = null: LLM 判定不是找歌意图,或调用失败。
      // 落到下面的默认 LLM 对话流程,保证用户至少能收到一句聊天回复。
    } catch (err) {
      console.warn(`[chat] llm-plan failed for message="${msg}":`, err instanceof Error ? err.message : String(err));
      // 异常落回默认 LLM 流程。
    }

    // Build real environment
    const [weatherSnapshot, calendarItems, playbackDevices] = await Promise.all([
      deps.weather.current().catch(() => ({ summary: "unknown", moodHint: "calm" })),
      deps.calendar.upcoming().catch(() => []),
      deps.devices.list().catch(() => [])
    ]);
    const environment = {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    };

    // Default: LLM streaming with full context
    const decision = await computeDjDecision({
      llm: deps.llm,
      now,
      systemPrompt: deps.systemPrompt,
      userTaste: deps.userPreferences.taste,
      routines: deps.userPreferences.routines,
      moodRules: deps.userPreferences.moodRules,
      recentMemory,
      userMessage: msg,
      toolResults: [],
      executionState: currentTrack
        ? `now playing: ${currentTrack.title} - ${currentTrack.artist}${currentTrack.album ? `（专辑：${currentTrack.album}）` : ""}`
        : "idle",
      environment,
    });

    // Stream the response
    const sentences = splitIntoSentences(decision.say);
    for (const sentence of sentences) {
      emitter.emit("chunk", sentence);
    }

    // If LLM suggests music, resolve and play it
    const playQuery = decision.play?.query;
    const isMusicRequest = playQuery && playQuery !== "keep current";

    if (isMusicRequest) {
      try {
        // DJ 推荐歌曲: 走推荐引擎,把用户当下要的曲风(playQuery)塞到 query 列表最前,
        // 但 seeds/excludeTrackIds 仍来自用户的真实 liked songs + 最近播放,避免再次跑偏。
        // 不再裸调 music.search(playQuery)——那条路径完全无视用户喜好,
        // 导致"换 jazz"返回的是网易云搜索热度榜,跟用户实际品味无关。
        const { buildRecommendationContext, selectRecommendedCandidates, extractTasteKeywords } = await import("../recommendation/recommendation-engine.js");
        const { buildTodayPlan, getCurrentPlanBlock } = await import("../scheduler/radio-scheduler.js");
        const queue = deps.state.getQueue();
        const excluded = new Set([
          ...deps.state.getRecentlySelectedTrackIds(),
          ...(currentTrack ? [currentTrack.id] : []),
          ...queue.map((t) => t.id)
        ]);
        const currentPlan = buildTodayPlan(now, deps.userPreferences.playlists);
        const currentBlock = getCurrentPlanBlock(currentPlan, now) ?? {
          at: "runtime",
          label: "对话推荐",
          moodHint: deps.currentMoodHint
        };
        const likedSongTracks = await deps.likedSongs.list().catch(() => []);
        const context = buildRecommendationContext({
          now,
          block: currentBlock,
          weather: weatherSnapshot,
          calendar: calendarItems,
          userPreferences: deps.userPreferences,
          likedSongs: likedSongTracks,
          recentTrackIds: excluded,
          queuedTrackIds: new Set(queue.map((t) => t.id))
        });

        // 用户消息里明确提到的实体名(艺术家/歌曲/专辑)，是比 LLM playQuery 更强的信号。
        // playQuery 是 LLM 的"二手翻译"(用户说 Pink Floyd, LLM 可能写成 classic rock),
        // 而网易云搜索靠原名命中。这里从用户原话里抽实体名,和 playQuery 并列进 queries 最前,
        // 双保险:既给 LLM 翻译的意图,也给用户原话。
        const mentionedEntities = extractMentionedEntities(msg, extractTasteKeywords);
        const tasteAwareQueries = uniqueQueries([...mentionedEntities, playQuery, ...context.queries]);

        const candidates = await selectRecommendedCandidates({
          music: deps.music,
          context: { ...context, queries: tasteAwareQueries },
          limit: 5
        });

        if (candidates.length === 0) {
          console.warn(`[chat] No candidates for message="${msg}" playQuery="${playQuery}" queries=${JSON.stringify(tasteAwareQueries)}`);
          // 不要静默吞掉——告诉用户没找到,引导换个说法,而不是装没事让用户以为 DJ 不想理。
          const fallbackText = `${decision.say}没找到特别合适的,要不换个说法?比如直接报歌名或歌手名,我帮你插到下一首。`;
          emitter.emit("chunk", "没找到特别合适的,要不换个说法?比如直接报歌名或歌手名,我帮你插到下一首。");
          await deps.sessionRepo.appendMessage({
            timestamp: new Date().toISOString(),
            role: "agent",
            text: fallbackText,
            ...(currentTrack ? { trackId: currentTrack.id } : {})
          });
          emitter.emit("done", { text: fallbackText });
          return;
        }
        const suggestions = candidates.map((c) => c.track);
        const suggestText = `我挑了几首你可能会喜欢的：${suggestions.map((t) => `《${t.title}》`).join("、")}。点一首我就插到下一首。`;
        emitter.emit("chunk", suggestText);
        const responseText = `${decision.say}${suggestText}`;
        const action: NonNullable<ChatDonePayload["action"]> = {
          type: "track-suggestion",
          tracks: suggestions
        };
        await deps.sessionRepo.appendMessage({
          timestamp: new Date().toISOString(),
          role: "agent",
          text: responseText,
          ...(currentTrack ? { trackId: currentTrack.id } : {})
        });

        emitter.emit("done", {
          text: responseText,
          action
        });
        return;
      } catch (err) {
        console.warn(`[chat] track-suggestion failed for message="${msg}":`, err instanceof Error ? err.message : String(err));
        // 候选解析异常,退回纯文本回复(下方统一保存+done)。
      }
    }

    // Save agent response
    const agentEntry: { timestamp: string; role: "agent"; text: string; trackId?: string } = {
      timestamp: new Date().toISOString(),
      role: "agent",
      text: decision.say
    };
    if (currentTrack) agentEntry.trackId = currentTrack.id;
    await deps.sessionRepo.appendMessage(agentEntry);

    emitter.emit("done", {
      text: decision.say,
    });
  };
}
