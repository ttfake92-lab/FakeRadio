import { describe, it, expect, vi } from "vitest";
import type { Track } from "@fakeradio/shared";
import type { LlmAdapter } from "../adapters/types.js";
import { planLlmRecommendation, __internals } from "./llm-recommend-planner.js";

function track(id: string, title: string, artist: string): Track {
  return {
    id,
    title,
    artist,
    album: "—",
    durationMs: 200_000,
    source: "netease"
  };
}

function makeLlm(response: unknown): LlmAdapter {
  return {
    compute: vi.fn(),
    computeRaw: vi.fn(),
    computeJson: vi.fn().mockResolvedValue(response)
  };
}

describe("planLlmRecommendation", () => {
  it("returns plan when LLM marks isMusicRequest=true with queries", async () => {
    const llm = makeLlm({
      isMusicRequest: true,
      say: "好,给你换一批迷幻摇滚",
      queries: ["Pink Floyd", "Tame Impala", "King Gizzard"],
      avoid: []
    });
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "想听摇滚",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).not.toBeNull();
    expect(plan!.queries).toEqual(["Pink Floyd", "Tame Impala", "King Gizzard"]);
    expect(plan!.say).toBe("好,给你换一批迷幻摇滚");
  });

  it("returns null when LLM marks isMusicRequest=false (idle chat)", async () => {
    const llm = makeLlm({
      isMusicRequest: false,
      say: "嗯。",
      queries: [],
      avoid: []
    });
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "你好",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).toBeNull();
  });

  it("returns null when LLM returns empty queries even if marked true", async () => {
    const llm = makeLlm({ isMusicRequest: true, say: "好", queries: [], avoid: [] });
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "想听点啥",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).toBeNull();
  });

  it("returns null when LLM throws (network error)", async () => {
    const llm: LlmAdapter = {
      compute: vi.fn(),
      computeRaw: vi.fn(),
      computeJson: vi.fn().mockRejectedValue(new Error("timeout"))
    };
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "想听摇滚",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).toBeNull();
  });

  it("filters non-string entries from queries array", async () => {
    const llm = makeLlm({
      isMusicRequest: true,
      say: "嗯",
      queries: ["Pink Floyd", 123, null, "  ", "Tame Impala"],
      avoid: []
    });
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "x",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).not.toBeNull();
    expect(plan!.queries).toEqual(["Pink Floyd", "Tame Impala"]);
  });

  it("passes user profile / taste / recent artists into the prompt", async () => {
    const llm = makeLlm({
      isMusicRequest: true,
      say: "嗯",
      queries: ["X"],
      avoid: []
    });
    await planLlmRecommendation({
      llm,
      userMessage: "想听摇滚",
      currentTrack: track("t1", "Comfortably Numb", "Pink Floyd"),
      profile: "我是 35 岁创作者,喜欢老摇滚。",
      taste: "经典摇滚为主,排斥金属与口水歌。",
      routines: "深夜偏好慢板。",
      likedSongs: [track("l1", "Wish You Were Here", "Pink Floyd")],
      recentChat: ["[USER] 之前说想听轻一点", "[DJ] 好,给你 Norah Jones"],
      recentArtists: ["Pink Floyd", "Queen", "Norah Jones"]
    });
    // 验证 user prompt 里包含了上下文
    const calls = (llm.computeJson as any).mock.calls;
    expect(calls.length).toBe(1);
    const userPrompt = calls[0][1] as string;
    expect(userPrompt).toContain("想听摇滚");
    expect(userPrompt).toContain("Pink Floyd");                  // 当前曲目 + liked + recentArtists
    expect(userPrompt).toContain("Norah Jones");                 // recentArtists
    expect(userPrompt).toContain("经典摇滚为主,排斥金属与口水歌"); // taste
    expect(userPrompt).toContain("35 岁创作者");                  // profile
  });

  it("includes 'avoid' list when LLM returns one", async () => {
    const llm = makeLlm({
      isMusicRequest: true,
      say: "嗯",
      queries: ["Pink Floyd"],
      avoid: ["Queen", "Bohemian Rhapsody"]
    });
    const plan = await planLlmRecommendation({
      llm,
      userMessage: "换一首,别再来 Queen 了",
      currentTrack: null,
      profile: "",
      taste: "",
      routines: "",
      likedSongs: [],
      recentChat: [],
      recentArtists: []
    });
    expect(plan).not.toBeNull();
    expect(plan!.avoid).toEqual(["Queen", "Bohemian Rhapsody"]);
  });
});

describe("__internals.parsePlan", () => {
  it("rejects raw values that are not objects", () => {
    expect(__internals.parsePlan(null)).toBeNull();
    expect(__internals.parsePlan("string")).toBeNull();
    expect(__internals.parsePlan(123)).toBeNull();
  });

  it("rejects when isMusicRequest is not literally true", () => {
    expect(__internals.parsePlan({ isMusicRequest: "yes", queries: ["X"] })).toBeNull();
    expect(__internals.parsePlan({ isMusicRequest: 1, queries: ["X"] })).toBeNull();
  });
});
