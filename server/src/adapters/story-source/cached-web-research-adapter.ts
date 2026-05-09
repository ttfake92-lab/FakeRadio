import type { Track, StorySourceNote } from "@fakeradio/shared";
import type { StorySourceAdapter } from "../types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  data: StorySourceNote[];
  expiresAt: number;
};

export function createCachedStorySourceAdapter(
  inner: StorySourceAdapter,
  ttlMs: number = ONE_DAY_MS,
  maxEntries: number = 200
): StorySourceAdapter {
  const cache = new Map<string, CacheEntry>();

  function cacheKey(track: Track): string {
    return `${track.artist}::${track.title}`;
  }

  function evictIfNeeded(): void {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
  }

  return {
    async gather(track: Track): Promise<StorySourceNote[]> {
      const key = cacheKey(track);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }

      const result = await inner.gather(track);
      evictIfNeeded();
      cache.set(key, { data: result, expiresAt: Date.now() + ttlMs });
      return result;
    }
  };
}
