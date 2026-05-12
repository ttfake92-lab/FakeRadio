import { ChatRequestSchema, ChatResponseSchema } from "@fakeradio/shared";
import type { ComputeDjDecisionInput } from "../brain/dj-brain.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { buildMockEnvironment } from "../utils/mock-environment.js";
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
import type { Track } from "@fakeradio/shared";
import { parseBriefIntent, createBriefFromIntent } from "../show/brief-intent-parser.js";
import { formatRadioDate } from "../utils/time.js";

function createKeepCurrentDecision(say: string, reason: string, segue?: string) {
  return {
    say,
    play: { query: "keep current", reason },
    reason,
    segue: segue ?? say
  };
}

function buildChatDecisionInput(
  deps: Pick<RegisterRoutesDeps, "llm" | "userPreferences">,
  currentTrack: Track | null,
  systemPrompt: string,
  userMessage: string
): ComputeDjDecisionInput {
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
    environment: buildMockEnvironment()
  };
}

export async function handleChat(
  body: unknown,
  deps: RegisterRoutesDeps
): Promise<ReturnType<typeof ChatResponseSchema.parse>> {
  const {
    state, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, currentMoodHint, nowProvider, baseDir, programBriefRepo
  } = deps;

  const parsedBody = ChatRequestSchema.parse(body);
  const msg = parsedBody.message.trim();
  const currentTrack = state.getCurrentTrack();
  const now = new Date().toISOString();

  const episodeRunnerDeps: EpisodeRunnerDeps = {
    llm, music: deps.music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, memory, state, systemPrompt,
    userPreferences, musicStatus: deps.musicStatus, currentMoodHint, nowProvider, likedSongs
  };

  const userEntry: { timestamp: string; role: "user"; text: string; trackId?: string } = { timestamp: now, role: "user", text: msg };
  if (currentTrack) userEntry.trackId = currentTrack.id;
  await sessionRepo.appendMessage(userEntry);

  // Intent: create-brief (theme-show or block-theme)
  const nowDate = nowProvider ? nowProvider() : new Date();
  const briefIntent = parseBriefIntent(msg, nowDate);
  if (briefIntent.isBriefIntent) {
    const targetDate = formatRadioDate(nowDate);
    const brief = createBriefFromIntent(briefIntent, targetDate, "user-requested");
    await programBriefRepo.save(brief);

    const confirmMsg = briefIntent.type === "theme-show"
      ? `好的，我来帮你制作一期「${briefIntent.topic}」主题节目。你可以继续追加约束，或者直接说"开始生成"。`
      : `好的，今晚我会准备「${briefIntent.topic}」相关的内容。`;

    const decision = createKeepCurrentDecision(confirmMsg, "brief created");
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: confirmMsg });
    return ChatResponseSchema.parse({ message: confirmMsg, decision, brief });
  }

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

  // Intent: export-episode
  if (/^(生成.*节目|导出|打包|export)/i.test(msg)) {
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
      ...buildChatDecisionInput(deps, currentTrack,
        `你是品味管理助手。用户要修改音乐品味偏好。当前品味文件内容：\n${currentTaste}\n\n请根据用户的输入，生成更新后的完整品味文件内容（Markdown 格式）。只输出品味文件内容，不要多余解释。`,
        msg
      )
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
      ...buildChatDecisionInput(deps, currentTrack,
        `你是音乐故事讲述者。根据以下资料为歌曲《${currentTrack.title}》（${currentTrack.artist}）写一段简短的背景故事（2-3 句话）。如果没有资料，就做情感解读。只输出故事文本。\n\n资料：${storyContext}`,
        msg
      )
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
      ...buildChatDecisionInput(deps, currentTrack,
        `你是音乐回忆编织者。用户分享了关于歌曲《${currentTrack.title}》（${currentTrack.artist}）的个人回忆。请将用户的回忆与歌曲自然连接，生成一段温暖的短故事（2-3 句话，第一人称叙述）。只输出故事文本。`,
        msg
      )
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

  // Default: LLM chat
  const decision = await computeDjDecision({
    ...buildChatDecisionInput(deps, currentTrack, systemPrompt, msg)
  });

  // If the LLM decision includes a music query, actually play that track
  const playQuery = decision.play?.query;
  const isMusicRequest = playQuery && playQuery !== "keep current";

  if (isMusicRequest) {
    // User wants music — resolve and play the suggested track
    const { track, decision: resolvedDecision } = await resolveNextTrackAndDecision(episodeRunnerDeps);
    const { result: ttsResult } = await synthesizeWithFallback(tts, ttsCacheDir, resolvedDecision.say);
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    state.setDj({ say: resolvedDecision.say, audioUrl: ttsResult.audioUrl, segue: resolvedDecision.segue });
    stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
    stream.broadcast({ type: "dj-speech", payload: { text: resolvedDecision.say, audioUrl: ttsResult.audioUrl } });
    const chatHookText = resolvedDecision.say.split(/[。！？.!?]/)[0]?.trim();
    if (chatHookText && chatHookText.length > 0) {
      stream.broadcast({
        type: "agent-message",
        payload: { role: "agent", text: chatHookText, trackId: track.id }
      });
    }
    await sessionRepo.appendMessage({ timestamp: new Date().toISOString(), role: "agent", text: resolvedDecision.say, trackId: track.id });
    return ChatResponseSchema.parse({
      message: resolvedDecision.say,
      decision: resolvedDecision,
      action: { type: "next-track" }
    });
  }

  const agentEntry: { timestamp: string; role: "agent"; text: string; trackId?: string } = { timestamp: new Date().toISOString(), role: "agent", text: decision.say };
  if (currentTrack) agentEntry.trackId = currentTrack.id;
  await sessionRepo.appendMessage(agentEntry);
  return ChatResponseSchema.parse({ message: decision.say, decision });
}
