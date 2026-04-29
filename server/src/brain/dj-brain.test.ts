import { describe, expect, it } from "vitest";
import { createMockLlmAdapter } from "../adapters/index.js";
import { computeDjDecision } from "./dj-brain.js";

describe("computeDjDecision", () => {
  it("builds context and returns a validated decision", async () => {
    const decision = await computeDjDecision({
      llm: createMockLlmAdapter(),
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激音乐。",
      routines: "早晨低刺激启动。",
      moodRules: "晴天温暖轻盈。",
      recentMemory: [],
      userMessage: "早上好",
      toolResults: [],
      executionState: "idle",
      environment: {
        weather: "晴，22C",
        calendar: "09:00 专注工作",
        devices: "Local Browser available"
      }
    });

    expect(decision.play.query).toBe("warm morning indie");
    expect(decision.segue).toContain("开场");
  });
});
