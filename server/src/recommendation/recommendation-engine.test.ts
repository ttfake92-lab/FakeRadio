import { describe, expect, it, vi } from "vitest";
import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../adapters/types.js";
import {
  buildRecommendationContext,
  selectRecommendedTrack,
  selectRecommendedCandidates
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

  it("ranks weather-flavored taste queries above block-seed taste queries", () => {
    const context = buildRecommendationContext({
      now: new Date("2026-06-21T09:30:00+08:00"),
      block: { at: "09:00", label: "专注工作", moodHint: "focus instrumental" },
      weather: { summary: "雨", moodHint: "冷冽而深邃", temperatureC: 15 },
      calendar: [],
      userPreferences: {
        taste: "喜欢后摇和钢琴。",
        routines: "",
        moodRules: "",
        playlists: []
      },
      likedSongs: [],
      recentTrackIds: new Set(),
      queuedTrackIds: new Set()
    });

    // 天气因子权重高于每日编排: "post rock + 天气" 必须排在 "post rock + 编排场景词" 之前
    const weatherQueryIndex = context.queries.indexOf("post rock 冷冽而深邃");
    const blockQueryIndex = context.queries.indexOf("post rock focus instrumental");
    expect(weatherQueryIndex).toBeGreaterThanOrEqual(0);
    expect(blockQueryIndex).toBeGreaterThanOrEqual(0);
    expect(weatherQueryIndex).toBeLessThan(blockQueryIndex);
    // 雨天直接压低能量,不管编排 block 是白天专注时段
    expect(context.intent.energy).toBe("low");
    // 信号里天气排在 daypart 之前
    expect(context.signals.indexOf("weather:冷冽而深邃")).toBeLessThan(context.signals.indexOf("daypart:专注工作"));
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

  it("spreads candidates across multiple queries instead of letting the first query take all slots", async () => {
    // 之前 selectRecommendedCandidates 单个 query 命中就能霸占所有 slot,
    // 导致风格切换时 "rock" 第一次命中就把代表艺术家挤掉。
    // 修复后每个 query 最多贡献 perQueryQuota 首,代表艺术家能拿到位置。
    const rockJunk = [
      track("r1", "Rock 1", "Junk Band"),
      track("r2", "Rock 2", "Junk Band"),
      track("r3", "Rock 3", "Junk Band"),
      track("r4", "Rock 4", "Junk Band"),
      track("r5", "Rock 5", "Junk Band")
    ];
    const queenSongs = [track("q1", "Bohemian Rhapsody", "Queen")];
    const pinkFloydSongs = [track("p1", "Wish You Were Here", "Pink Floyd")];

    const music = fakeMusic({
      search: vi.fn().mockImplementation(async (q: string) => {
        if (q === "rock") return rockJunk;
        if (q === "Queen") return queenSongs;
        if (q === "Pink Floyd") return pinkFloydSongs;
        return [];
      }),
      recommend: vi.fn().mockResolvedValue([])
    });

    const candidates = await selectRecommendedCandidates({
      music,
      context: {
        now: new Date(),
        block: { at: "runtime", label: "对话推荐", moodHint: "rock" },
        weather: { summary: "clear", moodHint: "clear" },
        calendar: [],
        userPreferences: { taste: "", routines: "", moodRules: "", playlists: [] },
        likedSongs: [],
        recentTrackIds: new Set(),
        queuedTrackIds: new Set(),
        excludedTrackIds: new Set(),
        seedTracks: [],
        queries: ["rock", "Queen", "Pink Floyd"],
        signals: [],
        intent: { priority: "curated-radio", energy: "medium", daypart: "对话推荐", weatherMood: "clear" }
      },
      limit: 5
    });

    const ids = candidates.map((c) => c.track.id);
    expect(ids).toContain("q1");
    expect(ids).toContain("p1");
    // "rock" query 不允许把 5 个 slot 全占满
    const rockCount = ids.filter((id) => id.startsWith("r")).length;
    expect(rockCount).toBeLessThanOrEqual(2);
  });

  describe("exploration randomization", () => {
    const manyLiked = Array.from({ length: 12 }, (_, i) =>
      track(`liked-${i}`, `Song ${i}`, `Artist ${i % 4}`)
    );
    const baseInput = {
      now: new Date("2026-07-11T10:00:00+08:00"),
      block: { at: "10:00", label: "上午", moodHint: "morning" },
      weather: { summary: "clear", moodHint: "clear" },
      calendar: [],
      userPreferences: { taste: "", routines: "", moodRules: "", playlists: [] },
      likedSongs: manyLiked,
      recentTrackIds: new Set<string>(),
      queuedTrackIds: new Set<string>()
    };

    it("samples simi seeds randomly instead of always taking the first 8 liked songs", () => {
      // random 恒为 0.99 → 采样总是换到池尾;恒为 0 → 保持原位。两者必须产出不同种子。
      const tailBiased = buildRecommendationContext({ ...baseInput, random: () => 0.99 });
      const headBiased = buildRecommendationContext({ ...baseInput, random: () => 0 });
      expect(tailBiased.seedTracks).toHaveLength(8);
      expect(headBiased.seedTracks).toHaveLength(8);
      expect(tailBiased.seedTracks.map((t) => t.id)).not.toEqual(headBiased.seedTracks.map((t) => t.id));
      // 采样不改变个性化来源:种子必须仍然全部来自收藏
      const likedIds = new Set(manyLiked.map((t) => t.id));
      for (const seed of tailBiased.seedTracks) expect(likedIds.has(seed.id)).toBe(true);
    });

    it("orders artist queries with weighted randomness rather than a fixed frequency sort", () => {
      // Artist 0 出现频次最高(4 次)。random 恒为 0.99 时,加权抽样几乎不会先抽中它。
      const shuffled = buildRecommendationContext({ ...baseInput, random: () => 0.99 });
      expect(shuffled.queries[0]).not.toBe("Artist 0");
      // 所有高频艺术家仍然都在 query 列表里,只是顺序被洗牌
      for (const name of ["Artist 0", "Artist 1", "Artist 2", "Artist 3"]) {
        expect(shuffled.queries).toContain(name);
      }
    });
  });
});
