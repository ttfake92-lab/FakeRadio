import type { StorySourceAdapter } from "../types.js";

export function createEmptyStorySourceAdapter(): StorySourceAdapter {
  return {
    async gather() {
      return [];
    }
  };
}
