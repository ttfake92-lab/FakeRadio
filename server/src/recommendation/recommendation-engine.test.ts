import { describe, expect, it, vi } from "vitest";
import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../adapters/types.js";
import {
  buildRecommendationContext,
  selectRecommendedTrack
} from "./recommendation-engine.js";

function track(id: string, title: string, artist = "Test Artist"): Track {
  return {
    id,
    title,
    artist,
    album: "Test Album",
    durationMs: 180000,
    source: "netease"
  };
}

function fakeMusic(overrides: Partial<MusicAdapter> = {}): MusicAdapter {
  return {
    search: vi.fn().mockResolvedValue([]),
    recommend: vi.fn().mockResolvedValue([]),
    resolve: vi.fn().mockImplementation(async (candidate: Track) => ({
      ...candidate,
      audioUrl: `https://audio.example/${candidate.id}.mp3`
    })),
    ...overrides
  };
}

describe("Recommendation Engine", () => {
  it("builds curator queries from daypart, weather, playlist seeds, taste, and mood rules", () => {
    const context = buildRecommendationContext({
      now: new Date("2026-06-21T13:30:00+08:00"),
      block: {
        at: "12:00",
        label: "午间轻松",
        moodHint: "light acoustic"
      },
      weather: {
        summary: "小雨",
        moodHint: "rainy",
        temperatureC: 18
      },
      calendar: [],
      userPreferences: {
        taste: "喜欢经典摇滚、后摇、低刺激、少鼓点。",
        routines: "工作时段稳定少打扰。",
        moodRules: "阴雨天气：降低高频刺激，增加空间感。",
        playlists: [
          {
            id: "midday-light",
            name: "午间轻松",
            description: "轻松明亮、适合午休恢复。",
            seeds: ["light acoustic", "chill folk"]
          }
        ]
      },
      likedSongs: [],
      recentTrackIds: new Set(),
      queuedTrackIds: new Set()
    });

    expect(context.intent.priority).toBe("curated-radio");
    expect(context.intent.energy).toBe("low");
    expect(context.queries).toContain("light acoustic rainy");
    expect(context.queries).toContain("chill folk rainy");
    expect(context.queries.some((query) => query.includes("post rock"))).toBe(true);
    expect(context.signals).toContain("daypart:午间轻松");
    expect(context.signals).toContain("weather:rainy");
  });

  it("uses liked songs as taste seeds but selects similar or search candidates before original liked songs", async () => {
    const liked = track("fav-queen", "Somebody To Love", "Queen");
    const similar = track("sim-bowie", "Life On Mars?", "David Bowie");
    const music = fakeMusic({
      recommend: vi.fn().mockImplementation(async (input) => input.seeds?.length ? [similar] : []),
      search: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockImplementation(async (candidate: Track) => ({
        ...candidate,
        audioUrl: `https://audio.example/${candidate.id}.mp3`
      }))
    });

    const context = buildRecommendationContext({
      now: new Date("2026-06-21T21:30:00+08:00"),
      block: {
        at: "21:00",
        label: "晚间降速",
        moodHint: "ambient pop night"
      },
      weather: {
        summary: "晴",
        moodHint: "clear",
        temperatureC: 22
      },
      calendar: [],
      userPreferences: {
        taste: "喜欢 Queen、Pink Floyd 和 David Bowie 的经典摇滚，也偏好安静版本。",
        routines: "21:00 后降低能量和语言密度。",
        moodRules: "深夜时段：可引入经典慢板作为安神过渡。",
        playlists: []
      },
      likedSongs: [liked],
      recentTrackIds: new Set(),
      queuedTrackIds: new Set()
    });

    const result = await selectRecommendedTrack({
      music,
      context,
      limit: 5
    });

    expect(result.track.id).toBe("sim-bowie");
    expect(result.candidateSource).toBe("curated");
    expect(result.seedCount).toBe(1);
    expect(music.recommend).toHaveBeenCalledWith(expect.objectContaining({
      seeds: [liked],
      excludeTrackIds: expect.arrayContaining(["fav-queen"])
    }));
  });
});
