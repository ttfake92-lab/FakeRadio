import { describe, expect, it } from "vitest";
import {
  ChatRequestSchema,
  DjDecisionSchema,
  HealthResponseSchema,
  NowResponseSchema,
  StreamEventSchema,
  TrackSchema
} from "../index";

describe("FakeRadio shared contracts", () => {
  it("validates a playable track", () => {
    const track = TrackSchema.parse({
      id: "mock-001",
      title: "Morning Signal",
      artist: "FakeRadio",
      source: "mock",
      audioUrl: "https://example.com/audio/morning-signal.mp3"
    });

    expect(track.id).toBe("mock-001");
  });

  it("requires a DJ decision to contain either a query or a track id", () => {
    expect(() =>
      DjDecisionSchema.parse({
        say: "我们先来一首让早晨慢慢亮起来的歌。",
        play: {
          reason: "缺少 query 或 trackId"
        },
        reason: "测试非法输出",
        segue: "进入播放"
      })
    ).toThrow();

    const decision = DjDecisionSchema.parse({
      say: "我们先来一首让早晨慢慢亮起来的歌。",
      play: {
        query: "warm morning indie",
        reason: "符合早晨的低刺激启动节奏"
      },
      reason: "用户偏好温暖、松弛、不打扰的开场。",
      segue: "从轻柔的吉他开始。"
    });

    expect(decision.play.query).toBe("warm morning indie");
  });

  it("validates HTTP and stream payload shapes", () => {
    expect(ChatRequestSchema.parse({ message: "来点适合写代码的" }).message).toBe("来点适合写代码的");
    expect(
      HealthResponseSchema.parse({
        ok: true,
        service: "FakeRadio",
        adapters: {
          llm: "mock",
          music: "mock",
          tts: "mock"
        },
        checkedAt: "2026-04-29T00:00:00.000Z"
      }).ok
    ).toBe(true);

    const now = NowResponseSchema.parse({
      playback: "idle",
      track: null,
      dj: {
        say: "电台准备好了。"
      },
      queue: [],
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    expect(StreamEventSchema.parse({ type: "now-playing", payload: now }).type).toBe("now-playing");
  });
});
