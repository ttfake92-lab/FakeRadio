import { describe, expect, it } from "vitest";
import { createMockLlmAdapter } from "./mock-llm-adapter.js";

function makeFragments(overrides: {
  weather?: string;
  calendar?: string;
  devices?: string;
  requestContent?: string;
  memoryContent?: string;
}) {
  return [
    {
      id: "system",
      label: "System prompt",
      content: "你是 FakeRadio DJ。",
      priority: 1,
      source: "system" as const
    },
    {
      id: "user",
      label: "用户语料",
      content: "taste: 喜欢低刺激音乐。\nroutines: 早晨低刺激启动。\nmoodRules: 晴天温暖轻盈。",
      priority: 2,
      source: "user" as const
    },
    {
      id: "environment",
      label: "环境注入",
      content: [
        `now: 2026-04-29T08:00:00.000Z`,
        `weather: ${overrides.weather ?? "晴, 温暖轻盈, 22C"}`,
        `calendar: ${overrides.calendar ?? "09:00 专注工作"}`,
        `devices: ${overrides.devices ?? "Local Browser available"}`
      ].join("\n"),
      priority: 3,
      source: "environment" as const
    },
    {
      id: "memory",
      label: "已检索记忆",
      content: overrides.memoryContent ?? "",
      priority: 4,
      source: "memory" as const
    },
    {
      id: "request",
      label: "用户输入和工具结果",
      content: overrides.requestContent ?? "message: \n",
      priority: 5,
      source: "request" as const
    },
    {
      id: "execution",
      label: "执行轨迹",
      content: "idle",
      priority: 6,
      source: "execution" as const
    }
  ];
}

describe("mock-llm-adapter environment awareness", () => {
  it("returns default output for sunny weather with calendar and devices", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(makeFragments({}));

    expect(decision.say).toBe("FakeRadio 已经准备好，我们先用一首温暖、轻盈的歌把状态打开。");
    expect(decision.play.query).toBe("warm morning indie");
    expect(decision.play.reason).toContain("mock 模式下默认选择");
  });

  it("returns rain-themed output when weather includes rain", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(
      makeFragments({ weather: "小雨, 湿润, 18C" })
    );

    expect(decision.say).toContain("雨");
    expect(decision.play.query).toBe("cozy indoor acoustic");
    expect(decision.play.reason).toContain("下雨");
  });

  it("returns empty-calendar output when calendar is blank", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(makeFragments({ calendar: "" }));

    expect(decision.say).toContain("日程很空");
    expect(decision.play.query).toBe("chill ambient focus");
    expect(decision.play.reason).toContain("日程很空");
  });

  it("returns no-device output when no available devices", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(makeFragments({ devices: "" }));

    expect(decision.say).toContain("设备暂不可用");
    expect(decision.play.query).toBe("soft background instrumental");
  });

  it("layers rain environment on top of grounded track", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(
      makeFragments({
        weather: "中雨, 阴冷, 15C",
        requestContent: "message: \nmusic.selectedTrack: Warm Plate Light - Sophia Bellamy Music"
      })
    );

    expect(decision.say).toContain("Warm Plate Light");
    expect(decision.say).toContain("雨");
    expect(decision.play.query).toBe("cozy indoor acoustic");
    expect(decision.reason).toContain("Warm Plate Light");
  });

  it("layers empty calendar on top of grounded track with previous track", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute(
      makeFragments({
        calendar: "",
        memoryContent: "playedTrack: Morning Signal - Test Artist",
        requestContent: "message: \nmusic.selectedTrack: Warm Plate Light - Sophia Bellamy Music"
      })
    );

    expect(decision.say).toContain("Morning Signal");
    expect(decision.say).toContain("日程很空");
    expect(decision.play.query).toBe("chill ambient focus");
  });
});
