import { describe, expect, it } from "vitest";
import { buildContextWindow } from "./context-builder";

describe("buildContextWindow", () => {
  it("builds the six context fragments in deterministic order", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激音乐。",
      routines: "早晨低刺激启动。",
      moodRules: "晴天温暖轻盈。",
      recentMemory: ["上一首播放 Morning Signal"],
      userMessage: "来点适合写代码的",
      toolResults: ["music.search 返回 3 首 mock 歌曲"],
      executionState: "queue empty",
      environment: {
        weather: "晴，22C",
        calendar: "09:00 专注工作",
        devices: "Local Browser available"
      }
    });

    expect(fragments.map((fragment) => fragment.source)).toEqual([
      "system",
      "user",
      "environment",
      "memory",
      "request",
      "execution"
    ]);
    expect(fragments[1]?.content).toContain("喜欢低刺激音乐");
  });
});
