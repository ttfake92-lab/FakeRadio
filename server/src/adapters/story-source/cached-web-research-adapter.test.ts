import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCachedStorySourceAdapter } from "./cached-web-research-adapter.js";
import type { StorySourceAdapter } from "../types.js";
import type { Track, StorySourceNote } from "@fakeradio/shared";

function makeTrack(id: string, title: string, artist: string): Track {
  return { id, title, artist, source: "local" };
}

function makeNotes(title: string): StorySourceNote[] {
  return [{ kind: "web", title, content: "test content" }];
}

describe("createCachedStorySourceAdapter", () => {
  it("delegates to inner adapter on cache miss", async () => {
    const inner: StorySourceAdapter = { gather: vi.fn().mockResolvedValue(makeNotes("result")) };
    const cached = createCachedStorySourceAdapter(inner);

    const result = await cached.gather(makeTrack("t1", "Song A", "Artist A"));
    expect(result).toEqual(makeNotes("result"));
    expect(inner.gather).toHaveBeenCalledOnce();
  });

  it("returns cached result on second call", async () => {
    const inner: StorySourceAdapter = { gather: vi.fn().mockResolvedValue(makeNotes("result")) };
    const cached = createCachedStorySourceAdapter(inner);

    await cached.gather(makeTrack("t1", "Song A", "Artist A"));
    await cached.gather(makeTrack("t1", "Song A", "Artist A"));

    expect(inner.gather).toHaveBeenCalledOnce();
  });

  it("different tracks have separate cache entries", async () => {
    const inner: StorySourceAdapter = { gather: vi.fn().mockResolvedValue(makeNotes("result")) };
    const cached = createCachedStorySourceAdapter(inner);

    await cached.gather(makeTrack("t1", "Song A", "Artist A"));
    await cached.gather(makeTrack("t2", "Song B", "Artist B"));

    expect(inner.gather).toHaveBeenCalledTimes(2);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    const inner: StorySourceAdapter = { gather: vi.fn().mockResolvedValue(makeNotes("result")) };
    const cached = createCachedStorySourceAdapter(inner, 1000); // 1s TTL

    await cached.gather(makeTrack("t1", "Song A", "Artist A"));
    vi.advanceTimersByTime(1001); // past TTL
    await cached.gather(makeTrack("t1", "Song A", "Artist A"));

    expect(inner.gather).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
