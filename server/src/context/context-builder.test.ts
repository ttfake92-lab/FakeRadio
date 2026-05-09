import { describe, expect, it } from "vitest";
import { buildContextWindow } from "./context-builder.js";

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
        weather: { summary: "晴", moodHint: "温暖轻盈", temperatureC: 22 },
        calendar: [{ title: "专注工作", start: "09:00", end: "12:00" }],
        devices: [{ id: "local-browser", name: "Local Browser", kind: "browser", status: "available" }]
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

  it("formats environment fragment from structured data", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: [],
      toolResults: [],
      executionState: "idle",
      environment: {
        weather: { summary: "晴", moodHint: "温暖轻盈", temperatureC: 22 },
        calendar: [
          { title: "专注工作", start: "09:00", end: "12:00" },
          { title: "午餐", start: "12:00", end: "13:00" }
        ],
        devices: [
          { id: "local-browser", name: "Local Browser", kind: "browser", status: "available" },
          { id: "upnp-1", name: "Living Room Speaker", kind: "upnp", status: "offline" }
        ]
      }
    });

    const envFragment = fragments.find((f) => f.source === "environment");
    expect(envFragment).toBeDefined();
    expect(envFragment!.content).toContain("weather: 晴, 温暖轻盈, 22C");
    expect(envFragment!.content).toContain("calendar: 09:00 专注工作, 12:00 午餐");
    expect(envFragment!.content).toContain("devices: Local Browser available, Living Room Speaker offline");
  });

  it("omits temperature when not provided", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: [],
      toolResults: [],
      executionState: "idle",
      environment: {
        weather: { summary: "多云", moodHint: "沉稳" },
        calendar: [],
        devices: []
      }
    });

    const envFragment = fragments.find((f) => f.source === "environment");
    expect(envFragment!.content).toContain("weather: 多云, 沉稳");
    expect(envFragment!.content).toContain("calendar: ");
    expect(envFragment!.content).toContain("devices: ");
  });

  it("handles empty recent memory", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: [],
      toolResults: [],
      executionState: "idle",
      environment: { weather: { summary: "晴", moodHint: "温暖" }, calendar: [], devices: [] }
    });

    const memoryFragment = fragments.find((f) => f.source === "memory");
    expect(memoryFragment!.content).toBe("");
  });

  it("includes multiple memory entries separated by newlines", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: ["played: Morning Signal", "played: Quiet Compiler", "user said: 代码时间"],
      toolResults: [],
      executionState: "idle",
      environment: { weather: { summary: "晴", moodHint: "温暖" }, calendar: [], devices: [] }
    });

    const memoryFragment = fragments.find((f) => f.source === "memory");
    expect(memoryFragment!.content).toContain("played: Morning Signal");
    expect(memoryFragment!.content).toContain("played: Quiet Compiler");
    expect(memoryFragment!.content).toContain("user said: 代码时间");
  });

  it("defaults userMessage to empty string when undefined", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: [],
      toolResults: ["tool output"],
      executionState: "idle",
      environment: { weather: { summary: "晴", moodHint: "温暖" }, calendar: [], devices: [] }
    });

    const requestFragment = fragments.find((f) => f.source === "request");
    expect(requestFragment!.content).toContain("message: ");
    expect(requestFragment!.content).toContain("tool output");
  });

  it("includes tool results in request fragment", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "sys",
      userTaste: "taste",
      routines: "routines",
      moodRules: "mood",
      recentMemory: [],
      userMessage: "test",
      toolResults: ["music.search returned 5 tracks", "weather.current: sunny"],
      executionState: "idle",
      environment: { weather: { summary: "晴", moodHint: "温暖" }, calendar: [], devices: [] }
    });

    const requestFragment = fragments.find((f) => f.source === "request");
    expect(requestFragment!.content).toContain("music.search returned 5 tracks");
    expect(requestFragment!.content).toContain("weather.current: sunny");
  });
});
