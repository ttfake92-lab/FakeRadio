import { describe, expect, it } from "vitest";
import {
  ChatRequestSchema,
  DjDecisionSchema,
  EpisodeNextResponseSchema,
  HealthResponseSchema,
  NowResponseSchema,
  RadioEpisodeSchema,
  StorySchema,
  StorySourceNoteSchema,
  StoryTypeSchema,
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

  it("strips undefined optional play keys from DJ decisions", () => {
    const decision = DjDecisionSchema.parse({
      say: "先用一首轻一点的歌进入状态。",
      play: {
        query: "quiet focus",
        trackId: undefined,
        reason: "避免显式 undefined 泄漏到共享 contract 类型"
      },
      reason: "用户需要稳定、不打扰的背景音乐。",
      segue: "轻轻接上。"
    });

    expect("trackId" in decision.play).toBe(false);
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

  it("validates story type enum values", () => {
    expect(StoryTypeSchema.parse("background")).toBe("background");
    expect(StoryTypeSchema.parse("lyric-theme")).toBe("lyric-theme");
    expect(StoryTypeSchema.parse("mood-reading")).toBe("mood-reading");
    expect(() => StoryTypeSchema.parse("invalid")).toThrow();
  });

  it("validates a story source note with optional fields", () => {
    const minimal = StorySourceNoteSchema.parse({
      kind: "mock",
      title: "mock source",
      content: "This is a placeholder source note."
    });
    expect(minimal.kind).toBe("mock");

    const full = StorySourceNoteSchema.parse({
      kind: "web",
      title: "Web Source",
      content: "Some web content",
      url: "https://example.com/source",
      confidence: 0.85
    });
    expect(full.confidence).toBe(0.85);
  });

  it("rejects story source note confidence outside 0-1", () => {
    expect(() =>
      StorySourceNoteSchema.parse({
        kind: "lyric",
        title: "Lyric",
        content: "...",
        confidence: 1.5
      })
    ).toThrow();
  });

  it("validates a complete radio episode", () => {
    const episode = RadioEpisodeSchema.parse({
      track: {
        id: "mock-001",
        title: "Morning Signal",
        artist: "FakeRadio",
        source: "mock",
        audioUrl: "https://example.com/audio/morning-signal.mp3"
      },
      story: {
        text: "这是一段关于早晨的故事。",
        audioUrl: "/cache/tts/mock-story.mp3",
        type: "mood-reading",
        estimatedDurationMs: 15000
      },
      sources: [
        {
          kind: "mock",
          title: "mock source",
          content: "placeholder"
        }
      ],
      playback: {
        crossfadeStartOffsetMs: 3000,
        musicStartVolume: 0.2
      }
    });

    expect(episode.story.type).toBe("mood-reading");
    expect(episode.playback.musicStartVolume).toBe(0.2);
  });

  it("validates episode next response shape", () => {
    const response = EpisodeNextResponseSchema.parse({
      episode: {
        track: {
          id: "mock-002",
          title: "Quiet Compiler",
          artist: "FakeRadio",
          source: "mock",
          audioUrl: "https://example.com/audio/quiet-compiler.mp3"
        },
        story: {
          text: "安静编译。",
          audioUrl: "/cache/tts/mock-story-2.mp3",
          type: "background"
        },
        sources: [],
        playback: {
          crossfadeStartOffsetMs: 2000,
          musicStartVolume: 0.1
        },
        fallbackReason: "no real sources available"
      }
    });

    expect(response.episode.track.title).toBe("Quiet Compiler");
    expect(response.episode.fallbackReason).toBe("no real sources available");
  });

  it("rejects invalid playback plan values", () => {
    expect(() =>
      RadioEpisodeSchema.parse({
        track: {
          id: "mock-001",
          title: "Morning Signal",
          artist: "FakeRadio",
          source: "mock"
        },
        story: {
          text: "...",
          audioUrl: "/cache/tts/story.mp3",
          type: "mood-reading"
        },
        sources: [],
        playback: {
          crossfadeStartOffsetMs: 1000,
          musicStartVolume: 1.5
        }
      })
    ).toThrow();
  });
});
