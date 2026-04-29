import type { TtsAdapter } from "../types.js";

export function createMockTtsAdapter(): TtsAdapter {
  return {
    async synthesize(text) {
      return {
        text,
        audioUrl: `/cache/tts/mock-${text.length}.mp3`,
        cacheKey: `mock-tts-${text.length}`
      };
    }
  };
}
