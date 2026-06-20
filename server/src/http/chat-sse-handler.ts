import type { RegisterRoutesDeps } from "./types.js";
import { handleShowProgrammingIntent } from "./chat-intent-router.js";
import { enqueueSuggestedTracks } from "./queue-suggestions.js";

export type ChatDonePayload = {
  text: string;
  action?: {
    type: "next-track" | "add-favorite" | "show-brief-created" | "show-plan-refined" | "show-confirmed" | "show-cancelled" | string;
    trackId?: string;
    title?: string;
    artist?: string;
    briefId?: string;
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

    // Load recent memory for context
    const todaySession = await deps.sessionRepo.getToday();
    const recentMemory = todaySession
      .filter((e) => e.role === "agent")
      .slice(-5)
      .map((e) => e.text);

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
        const queued = await enqueueSuggestedTracks(playQuery, {
          music: deps.music,
          state: deps.state,
          stateRepo: deps.stateRepo,
          stream: deps.stream
        });
        if (queued.length === 0) {
          throw new Error("No suggested tracks available");
        }
        const queuedText = `我把 ${queued.slice(0, 3).map((track) => `《${track.title}》`).join("、")} 加进今日播放列表了，先不打断正在播的这首。`;
        emitter.emit("chunk", queuedText);
        const responseText = `${decision.say}${queuedText}`;
        const action: NonNullable<ChatDonePayload["action"]> = { type: "queue-updated" };
        if (queued[0]) {
          action.trackId = queued[0].id;
          action.title = queued[0].title;
          action.artist = queued[0].artist;
        }
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
      } catch {
        // Music resolution failed, fall through to text-only response
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
