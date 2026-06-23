import { ChatRequestSchema, ChatResponseSchema, ShowPlanBlockSchema } from "@fakeradio/shared";
import type { ComputeDjDecisionInput } from "../brain/dj-brain.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { inferAndSaveTaste } from "../user/taste-inferer.js";
import { readTaste, writeTaste } from "../user/taste-writer.js";
import { startExportTask } from "../export/export-pipeline.js";
import {
  resolveNextTrackAndDecision,
  synthesizeWithFallback,
  type EpisodeRunnerDeps
} from "./episode-runner.js";
import { env } from "../config/env.js";
import type { RegisterRoutesDeps } from "./types.js";
import type { Track, ProgramBrief } from "@fakeradio/shared";
import { enqueueSuggestedTracks } from "./queue-suggestions.js";
import {
  parseBriefIntent,
  parseBriefIntentWithLlm,
  createBriefFromIntent
} from "../show/brief-intent-parser.js";
import { formatRadioDate } from "../utils/time.js";
import type { LlmAdapter } from "../adapters/types.js";
import type { SessionEntry } from "../user/session-repository.js";

function createKeepCurrentDecision(say: string, reason: string, segue?: string) {
  return {
    say,
    play: { query: "keep current", reason },
    reason,
    segue: segue ?? say
  };
}

async function buildChatDecisionInput(
  deps: Pick<RegisterRoutesDeps, "llm" | "userPreferences" | "weather" | "calendar" | "devices">,
  currentTrack: Track | null,
  systemPrompt: string,
  userMessage: string
): Promise<ComputeDjDecisionInput> {
  const [weatherSnapshot, calendarItems, playbackDevices] = await Promise.all([
    deps.weather.current(),
    deps.calendar.upcoming(),
    deps.devices.list()
  ]);
  return {
    llm: deps.llm,
    now: new Date(),
    systemPrompt,
    userTaste: deps.userPreferences.taste,
    routines: deps.userPreferences.routines,
    moodRules: deps.userPreferences.moodRules,
    recentMemory: [],
    userMessage,
    toolResults: [],
    executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
    environment: {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    }
  };
}

// ─── Show programming conversation ───────────────────────────────────────────

type ShowIntentType = "create" | "refine" | "confirm" | "cancel" | "none";

type ShowProgrammingDeps = Pick<
  RegisterRoutesDeps,
  | "llm"
  | "programBriefRepo"
  | "showPlanRepo"
  | "showPlanGenerator"
  | "sessionRepo"
  | "userPreferences"
  | "nowProvider"
  | "stream"
>;

const SHOW_INTENT_SYSTEM_PROMPT = `你是一个对话意图识别器。用户正在和电台 DJ 对话。

判断用户当前消息是否与"节目编排"相关，返回 JSON：
{
  "intent": "create|refine|confirm|cancel|none",
  "topic": "如果是 create，这里填节目主题",
  "refinement": "如果是 refine，简述用户想改什么"
}

意图说明：
- create: 用户明确想做一期新节目（如"帮我做一期xxx主题节目"、"策划一个xxx主题"、"今晚安排一期xxx"）。必须出现"做节目/期/策划/制作/安排"这类制作类动词
- none: 用户只是点歌、换风格、调氛围或聊天（如"想听点爵士"、"来点后摇"、"降速"、"安静一点"、"嗨一点"、"换一首"、"讲讲这首歌"、"最近在听 City Pop"），不要当成节目编排
- refine: 用户在修改已有节目计划（如"时长改成30分钟"、"加一段关于xxx的"、"第三段改轻松点"）。**前提:用户之前明确说过要做节目**;如果上下文里没有节目策划讨论,refine 一律视为 none
- confirm: 用户确认当前节目计划开始生成（如"开始生成"、"就这样吧"、"可以了"）。**前提:存在待确认的节目计划**;无上下文则视为 none
- cancel: 用户取消节目编排（如"算了"、"不做了"、"取消"）。**前提:正在节目编排中**

关键规则:
- "降速"/"嗨一点"/"换一首"/"安静"/"伤感一点"等单纯的氛围/风格切换 = none
- "讲讲这首"/"介绍下"/"这歌哪一年的"等关于当前曲目的提问 = none
- 不确定时一律选 none

只返回 JSON，不要其他文字。`;

function buildShowIntentPrompt(userMessage: string, recentContext: string): string {
  return `最近的对话上下文：
${recentContext}

用户当前消息：${userMessage}`;
}

async function detectShowIntent(
  llm: LlmAdapter,
  userMessage: string,
  recentMessages: SessionEntry[]
): Promise<{ intent: ShowIntentType; topic?: string; refinement?: string }> {
  // Build context from recent messages (last 10)
  const recent = recentMessages.slice(-10);
  const contextLines = recent.map((m) => {
    const role = m.role === "user" ? "用户" : "DJ";
    return `[${role}] ${m.text.slice(0, 200)}`;
  }).join("\n");

  // Quick regex pre-check for explicit intents
  const explicitBriefIntent = parseBriefIntent(userMessage, new Date()) ?? { isBriefIntent: false };
  if (explicitBriefIntent.isBriefIntent) {
    return { intent: "create", topic: explicitBriefIntent.topic };
  }
  if (/^(开始生成|就这样|可以了|开始吧|确认|ok|好$|行$|嗯$)/i.test(userMessage.trim())) {
    return { intent: "confirm" };
  }
  if (/^(算了|不做了|取消|cancel)/i.test(userMessage.trim())) {
    return { intent: "cancel" };
  }

  try {
    const result = await llm.computeJson<{
      intent: string;
      topic?: string;
      refinement?: string;
    }>(SHOW_INTENT_SYSTEM_PROMPT, buildShowIntentPrompt(userMessage, contextLines));

    const validIntents: ShowIntentType[] = ["create", "refine", "confirm", "cancel", "none"];
    const intent = validIntents.includes(result.intent as ShowIntentType)
      ? (result.intent as ShowIntentType)
      : "none";

    const out: { intent: ShowIntentType; topic?: string; refinement?: string } = { intent };
    if (result.topic !== undefined) out.topic = result.topic;
    if (result.refinement !== undefined) out.refinement = result.refinement;
    return out;
  } catch {
    return { intent: "none" };
  }
}

async function findLatestBrief(
  deps: Pick<ShowProgrammingDeps, "programBriefRepo">
): Promise<ProgramBrief | null> {
  const briefs = await deps.programBriefRepo.list();
  const active = briefs
    .filter((b) => b.status === "draft" || b.status === "confirmed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return active[0] ?? null;
}

async function handleShowCreate(
  topic: string,
  deps: ShowProgrammingDeps,
  msg: string
): Promise<ReturnType<typeof ChatResponseSchema.parse>> {
  const { programBriefRepo, showPlanRepo, showPlanGenerator, sessionRepo, userPreferences, nowProvider } = deps;

  // Try regex first, then LLM
  const nowDate = nowProvider ? nowProvider() : new Date();
  let intent = parseBriefIntent(msg, nowDate);
  if (!intent.isBriefIntent) {
    // Build a synthetic intent from the detected topic
    intent = {
      isBriefIntent: true,
      type: "theme-show",
      topic,
      scope: "full-show"
    };
  }

  const targetDate = formatRadioDate(nowDate);
  const brief = createBriefFromIntent(intent, targetDate, "user-requested");
  await programBriefRepo.save(brief);

  const plan = await showPlanGenerator.generate(brief, userPreferences.taste);
  await showPlanRepo.save(plan);

  // Summarize the plan for the user
  const blockSummary = plan.blocks
    .map((b, i) => `${i + 1}. ${b.title}`)
    .join("\n");

  const confirmMsg = `好的，我来帮你制作一期「${intent.topic}」主题节目。\n\n初步编排：\n${blockSummary}\n\n总时长约 ${plan.totalDurationMinutes ?? 60} 分钟。你可以继续调整，或者直接说"开始生成"。`;

  const decision = createKeepCurrentDecision(confirmMsg, "brief created");
  await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });
  return ChatResponseSchema.parse({
    message: confirmMsg,
    decision,
    brief,
    action: { type: "show-brief-created", briefId: brief.id }
  });
}

async function handleShowRefine(
  refinement: string,
  deps: ShowProgrammingDeps,
  msg: string
): Promise<ReturnType<typeof ChatResponseSchema.parse> | null> {
  const { programBriefRepo, showPlanRepo, showPlanGenerator, sessionRepo, llm, userPreferences } = deps;

  // Find the latest active brief
  const brief = await findLatestBrief(deps);
  if (!brief) return null;

  // Find the active plan for this brief
  const plans = await showPlanRepo.list({ briefId: brief.id, activeOnly: true });
  const activePlan = plans[0];
  if (!activePlan) return null;

  // Use LLM to interpret the refinement and generate updated blocks
  const refinementPrompt = `你是一个电台节目编排师。用户想修改已有的节目计划。

当前节目主题：${brief.topic}
当前节目计划：
${JSON.stringify(activePlan.blocks, null, 2)}

用户想做的修改：${msg}

请返回修改后的完整 blocks 数组（JSON 格式），保持相同的结构。
只返回 JSON 对象：{ "blocks": [...], "reason": "简述你做了什么修改" }`;

  try {
    const result = await llm.computeJson<{
      blocks: unknown[];
      reason?: string;
    }>(refinementPrompt, msg);

    if (result.blocks && Array.isArray(result.blocks) && result.blocks.length > 0) {
      // Validate each block with Zod before using
      const validatedBlocks = result.blocks.map((block) => ShowPlanBlockSchema.parse(block));
      const newPlan = await showPlanGenerator.generateFromPlan(activePlan, brief, {});
      newPlan.blocks = validatedBlocks;
      newPlan.version = activePlan.version + 1;
      await showPlanRepo.save(newPlan);

      const blockSummary = newPlan.blocks
        .map((b, i) => `${i + 1}. ${b.title}`)
        .join("\n");

      const reason = result.reason ? `\n\n调整说明：${result.reason}` : "";
      const confirmMsg = `已更新节目计划：\n\n${blockSummary}${reason}\n\n还可以继续调整，或者说"开始生成"。`;

      const decision = createKeepCurrentDecision(confirmMsg, "plan refined");
      await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });
      return ChatResponseSchema.parse({
        message: confirmMsg,
        decision,
        brief,
        action: { type: "show-plan-refined", briefId: brief.id }
      });
    }
  } catch {
    // LLM refinement failed
  }

  return null;
}

async function handleShowConfirm(
  deps: ShowProgrammingDeps
): Promise<ReturnType<typeof ChatResponseSchema.parse> | null> {
  const { programBriefRepo, sessionRepo, stream } = deps;

  const brief = await findLatestBrief(deps);
  if (!brief) return null;

  // Update brief status to confirmed
  await programBriefRepo.update(brief.id, { status: "confirmed" });

  const confirmMsg = `节目「${brief.topic}」已确认，你可以到「制作」面板点击"一键生成"来开始制作，或者说"现在生成"直接开始。`;
  const decision = createKeepCurrentDecision(confirmMsg, "brief confirmed");
  await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });

  // Broadcast agent message
  stream.broadcast({
    type: "agent-message",
    payload: { role: "agent", text: `节目「${brief.topic}」已确认` }
  });

  return ChatResponseSchema.parse({
    message: confirmMsg,
    decision,
    brief,
    action: { type: "show-confirmed", briefId: brief.id }
  });
}

async function handleShowCancel(
  deps: ShowProgrammingDeps
): Promise<ReturnType<typeof ChatResponseSchema.parse>> {
  const { programBriefRepo, sessionRepo } = deps;

  const brief = await findLatestBrief(deps);
  if (brief) {
    await programBriefRepo.update(brief.id, { status: "cancelled" });
  }

  const cancelMsg = "好的，节目编排已取消。";
  const decision = createKeepCurrentDecision(cancelMsg, "brief cancelled");
  await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: cancelMsg });
  return ChatResponseSchema.parse({
    message: cancelMsg,
    decision,
    action: { type: "show-cancelled" }
  });
}

export async function handleShowProgrammingIntent(
  msg: string,
  deps: ShowProgrammingDeps
): Promise<ReturnType<typeof ChatResponseSchema.parse> | null> {
  const { llm, sessionRepo } = deps;

  // Get recent conversation context
  const recentMessages = await sessionRepo.getToday();

  // Detect show programming intent using LLM
  const showIntent = await detectShowIntent(llm, msg, recentMessages);

  // 没有进行中的节目编排 brief 时,refine/confirm/cancel 都没意义。
  // LLM 看到"降速"/"再硬一点"这种话有概率误判为 refine——
  // 但只有用户先说过"帮我做一期X主题"才会有 brief。这里前置 gating,
  // 避免普通对话被错误劫持到节目编排流程(用户体验上就是"我只想换风格,
  // 怎么突然跳到节目页了")。
  if (showIntent.intent === "refine" || showIntent.intent === "confirm" || showIntent.intent === "cancel") {
    const brief = await findLatestBrief(deps);
    if (!brief) {
      return null; // 无进行中节目,意图无效,落到普通聊天/推荐流程
    }
  }

  switch (showIntent.intent) {
    case "create":
      return handleShowCreate(showIntent.topic ?? msg, deps, msg);
    case "refine":
      return handleShowRefine(showIntent.refinement ?? msg, deps, msg);
    case "confirm":
      return handleShowConfirm(deps);
    case "cancel":
      return handleShowCancel(deps);
    case "none":
    default:
      return null; // Not a show programming intent, continue to default chat
  }
}

// ─── Main chat handler ───────────────────────────────────────────────────────

export async function handleChat(
  body: unknown,
  deps: RegisterRoutesDeps
): Promise<ReturnType<typeof ChatResponseSchema.parse>> {
  const {
    state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, currentMoodHint, nowProvider, baseDir, programBriefRepo,
    showPlanRepo, showPlanGenerator
  } = deps;

  const parsedBody = ChatRequestSchema.parse(body);
  const msg = parsedBody.message.trim();
  const currentTrack = state.getCurrentTrack();
  const now = new Date().toISOString();

  const episodeRunnerDeps: EpisodeRunnerDeps = {
    llm, music: deps.music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, memory, state, systemPrompt,
    userPreferences, musicStatus: deps.runtimeManager?.getStatuses().music ?? deps.musicStatus, currentMoodHint, nowProvider, likedSongs
  };

  const userEntry: { timestamp: string; role: "user"; text: string; trackId?: string } = { timestamp: now, role: "user", text: msg };
  if (currentTrack) userEntry.trackId = currentTrack.id;
  await sessionRepo.appendMessage(userEntry);

  // ─── Quick-action intents (regex, instant) ──────────────────────────────

  // Intent: next-track
  if (/^(下一首|next|切歌|换一首)/i.test(msg)) {
    const { track, decision } = await resolveNextTrackAndDecision(episodeRunnerDeps);
    const { result: ttsResult } = await synthesizeWithFallback(tts, ttsCacheDir, decision.say);
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    state.setDj({ say: decision.say, audioUrl: ttsResult.audioUrl, segue: decision.segue });
    stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
    stream.broadcast({ type: "dj-speech", payload: { text: decision.say, audioUrl: ttsResult.audioUrl } });
    const chatHookText = decision.say.split(/[。！？.!?]/)[0]?.trim();
    if (chatHookText && chatHookText.length > 0) {
      stream.broadcast({
        type: "agent-message",
        payload: { role: "agent", text: chatHookText, trackId: track.id }
      });
    }
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: decision.say, trackId: track.id });
    return ChatResponseSchema.parse({
      message: decision.say,
      decision,
      action: { type: "next-track" }
    });
  }

  // Intent: add-favorite
  if (/^(收藏|喜欢这首歌|加入收藏|fav)/i.test(msg) && currentTrack) {
    await favorites.save({ trackId: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album });
    const confirmMsg = `已收藏《${currentTrack.title}》`;
    const decision = createKeepCurrentDecision(confirmMsg, "user favorited");
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg, trackId: currentTrack.id });
    return ChatResponseSchema.parse({
      message: confirmMsg,
      decision,
      action: { type: "add-favorite", trackId: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist }
    });
  }

  // Intent: export-episode (legacy — not show programming)
  if (/^(导出今天|打包今天|export today)/i.test(msg)) {
    try {
      const taskId = startExportTask({ favorites, trackRegistry, audioDir, exportDir, ttsCacheDir });
      const confirmMsg = `节目正在生成中，任务ID：${taskId}`;
      const decision = createKeepCurrentDecision(confirmMsg, "export started");
      await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });
      return ChatResponseSchema.parse({ message: confirmMsg, decision });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "导出失败";
      const decision = createKeepCurrentDecision(errMsg, "export failed");
      await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: errMsg });
      return ChatResponseSchema.parse({ message: errMsg, decision });
    }
  }

  // Intent: update-taste
  if (/^(不喜欢|以后少|更喜欢|少推|多推|不要|别再)/i.test(msg)) {
    const currentTaste = await readTaste(baseDir);
    const mergeDecision = await computeDjDecision({
      ...(await buildChatDecisionInput(deps, currentTrack,
        `你是品味管理助手。用户要修改音乐品味偏好。当前品味文件内容：\n${currentTaste}\n\n请根据用户的输入，生成更新后的完整品味文件内容（Markdown 格式）。只输出品味文件内容，不要多余解释。`,
        msg
      ))
    });

    await writeTaste(baseDir, mergeDecision.say);
    userPreferences.taste = mergeDecision.say;

    const confirmMsg = `已更新你的品味偏好。`;
    const decision = createKeepCurrentDecision(confirmMsg, "taste updated");
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg, storyType: "mood-reading" });
    return ChatResponseSchema.parse({ message: confirmMsg, decision });
  }

  // Intent: story-background
  if (/^(讲.*故事|背后|创作|story|background)/i.test(msg) && currentTrack) {
    const sources = webResearchAdapter
      ? await webResearchAdapter.gather(currentTrack).catch(() => [])
      : [];
    const hasResearch = sources.length > 0;
    const storyContext = hasResearch
      ? sources.map((s) => `${s.title}: ${s.content}`).join("\n")
      : "没有找到相关资料，请根据歌曲风格和情感进行解读。";
    const storyType = hasResearch ? "background" : "mood-reading";

    const storyDecision = await computeDjDecision({
      ...(await buildChatDecisionInput(deps, currentTrack,
        `你是音乐故事讲述者。根据以下资料为歌曲《${currentTrack.title}》（${currentTrack.artist}）写一段简短的背景故事（2-3 句话）。如果没有资料，就做情感解读。只输出故事文本。\n\n资料：${storyContext}`,
        msg
      ))
    });

    await sessionRepo.appendMessage({
      timestamp: new Date().toISOString(),
      role: "agent",
      text: storyDecision.say,
      trackId: currentTrack.id,
      storyType
    });

    const decision = createKeepCurrentDecision(storyDecision.say, "story told", storyDecision.say);
    return ChatResponseSchema.parse({ message: storyDecision.say, decision });
  }

  // Intent: personal-memory
  if (/^(让我想起|想起|回忆|那时候|记得|当年)/i.test(msg) && currentTrack) {
    const memoryDecision = await computeDjDecision({
      ...(await buildChatDecisionInput(deps, currentTrack,
        `你是音乐回忆编织者。用户分享了关于歌曲《${currentTrack.title}》（${currentTrack.artist}）的个人回忆。请将用户的回忆与歌曲自然连接，生成一段温暖的短故事（2-3 句话，第一人称叙述）。只输出故事文本。`,
        msg
      ))
    });

    await sessionRepo.appendMessage({
      timestamp: new Date().toISOString(),
      role: "agent",
      text: memoryDecision.say,
      trackId: currentTrack.id,
      storyType: "personal-memory"
    });

    const decision = createKeepCurrentDecision(memoryDecision.say, "memory story told", memoryDecision.say);
    return ChatResponseSchema.parse({ message: memoryDecision.say, decision });
  }

  // Intent: infer-taste
  if (/^(整理.*品味|品味.*推断|分析.*品味|infer.*taste)/i.test(msg)) {
    const todaySession = await sessionRepo.getToday();
    if (todaySession.length < 3) {
      const noDataMsg = "今天互动不够多，暂不更新品味。多和我聊聊吧！";
      const decision = createKeepCurrentDecision(noDataMsg, "insufficient data");
      return ChatResponseSchema.parse({ message: noDataMsg, decision });
    }

    const sessionSummary = todaySession.map((e) => `[${e.role}] ${e.text}`).join("\n");
    const favList = (await favorites.list()).map((f) => `${f.title} - ${f.artist}`).join(", ");

    const inferredTaste = await inferAndSaveTaste({ baseDir, llm, userPreferences, sessionSummary, favList, userMessage: msg });
    userPreferences.taste = inferredTaste;

    const confirmMsg = `已根据今天的互动更新品味偏好。`;
    const decision = createKeepCurrentDecision(confirmMsg, "taste inferred");
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });
    return ChatResponseSchema.parse({ message: confirmMsg, decision });
  }

  // ─── Show programming (LLM-powered, multi-turn) ────────────────────────

  const showResult = await handleShowProgrammingIntent(msg, deps);
  if (showResult) return showResult;

  // ─── Default: LLM chat ──────────────────────────────────────────────────

  const decision = await computeDjDecision({
    ...(await buildChatDecisionInput(deps, currentTrack, systemPrompt, msg))
  });

  // If the LLM decision includes a music query, queue suggestions without
  // interrupting the currently playing episode.
  const playQuery = decision.play?.query;
  const isMusicRequest = playQuery && playQuery !== "keep current";

  if (isMusicRequest) {
    const queued = await enqueueSuggestedTracks(playQuery, { music: deps.music, state, stateRepo, stream });
    if (queued.length === 0) {
      const agentEntry: { timestamp: string; role: "agent"; text: string; trackId?: string } = { timestamp: new Date().toISOString(), role: "agent", text: decision.say };
      if (currentTrack) agentEntry.trackId = currentTrack.id;
      await sessionRepo.appendMessage(agentEntry);
      return ChatResponseSchema.parse({ message: decision.say, decision });
    }
    const queuedText = `我把 ${queued.slice(0, 3).map((track) => `《${track.title}》`).join("、")} 加进今日播放列表了，先不打断正在播的这首。`;
    const message = `${decision.say}${queuedText}`;
    const queuedEntry: { timestamp: string; role: "agent"; text: string; trackId?: string } = {
      timestamp: new Date().toISOString(),
      role: "agent",
      text: message
    };
    if (currentTrack) queuedEntry.trackId = currentTrack.id;
    await sessionRepo.appendMessage(queuedEntry);
    const action: {
      type: "queue-updated";
      trackId?: string;
      title?: string;
      artist?: string;
    } = { type: "queue-updated" };
    if (queued[0]) {
      action.trackId = queued[0].id;
      action.title = queued[0].title;
      action.artist = queued[0].artist;
    }
    return ChatResponseSchema.parse({
      message,
      decision: createKeepCurrentDecision(message, "music suggestions queued"),
      action
    });
  }

  const agentEntry: { timestamp: string; role: "agent"; text: string; trackId?: string } = { timestamp: new Date().toISOString(), role: "agent", text: decision.say };
  if (currentTrack) agentEntry.trackId = currentTrack.id;
  await sessionRepo.appendMessage(agentEntry);
  return ChatResponseSchema.parse({ message: decision.say, decision });
}
