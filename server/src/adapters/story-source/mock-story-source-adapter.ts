import type { StorySourceAdapter } from "../types.js";

export function createMockStorySourceAdapter(): StorySourceAdapter {
  return {
    async gather(track) {
      return [
        {
          kind: "mock",
          title: "mock source",
          content: `Placeholder source note for ${track.title} by ${track.artist}.`
        }
      ];
    }
  };
}
