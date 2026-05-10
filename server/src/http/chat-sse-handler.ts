import type { RegisterRoutesDeps } from "./types.js";
import type { Track } from "@fakeradio/shared";

export type ChatDonePayload = {
  text: string;
  action?: {
    type: "next-track" | "add-favorite" | string;
    trackId?: string;
    title?: string;
    artist?: string;
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
>;

export function buildChatSSEHandler(deps: ChatSSEHandlerDeps) {
  return async function handleChatSSE(
    message: string,
    emitter: SSEEmitter
  ): Promise<void> {
    const { computeDjDecision } = await import("../brain/dj-brain.js");
    const { buildMockEnvironment } = await import("../utils/mock-environment.js");
    const { ChatRequestSchema } = await import("@fakeradio/shared");

    const msg = ChatRequestSchema.parse({ message }).message.trim();
    const currentTrack = deps.state.getCurrentTrack();

    // Intent: next-track
    if (/^(下一首|next|切歌|换一首)/i.test(msg)) {
      emitter.emit("done", {
        text: "正在切歌...",
        action: { type: "next-track" },
      });
      return;
    }

    // Intent: add-favorite
    if (/^(收藏|喜欢这首歌|加入收藏|fav)/i.test(msg) && currentTrack) {
      const text = `已收藏《${currentTrack.title}》`;
      emitter.emit("chunk", text);
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

    // Default: LLM streaming
    const decision = await computeDjDecision({
      llm: deps.llm,
      now: new Date(),
      systemPrompt: deps.systemPrompt,
      userTaste: deps.userPreferences.taste,
      routines: deps.userPreferences.routines,
      moodRules: deps.userPreferences.moodRules,
      recentMemory: [],
      userMessage: msg,
      toolResults: [],
      executionState: currentTrack
        ? `now playing: ${currentTrack.title}`
        : "idle",
      environment: buildMockEnvironment(),
    });

    const sentences = splitIntoSentences(decision.say);
    for (const sentence of sentences) {
      emitter.emit("chunk", sentence);
    }

    emitter.emit("done", {
      text: decision.say,
    });
  };
}
