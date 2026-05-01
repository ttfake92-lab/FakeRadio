import { describe, expect, it } from "vitest";
import {
  computeFadedVolume,
  formatDuration,
  getEpisodeStateLabel,
  getNextEpisodeLabel,
  getPlaybackLabel,
  getProviderStatusLabel,
  getSourceKindLabel,
  getStorySourceDescription,
  getStoryTypeLabel,
  getTrackSourceLabel,
  shouldStartCrossfade,
  shouldWarnOnMockMusic,
  transitEpisodeState
} from "./player-view-model";
import type { EpisodeEvent, EpisodePlaybackState } from "./player-view-model";

describe("player view model", () => {
  it("labels playback states in Chinese", () => {
    expect(getPlaybackLabel("idle")).toBe("待机");
    expect(getPlaybackLabel("playing")).toBe("播放中");
    expect(getPlaybackLabel("paused")).toBe("已暂停");
    expect(getPlaybackLabel("buffering")).toBe("缓冲中");
  });

  it("formats track duration", () => {
    expect(formatDuration(184000)).toBe("3:04");
    expect(formatDuration(undefined)).toBe("未知时长");
  });

  it("labels provider status and track source in Chinese", () => {
    expect(getProviderStatusLabel("ready")).toBe("真实来源已连接");
    expect(getProviderStatusLabel("mock")).toBe("已回退到 mock");
    expect(getTrackSourceLabel("netease")).toBe("网易云");
    expect(getTrackSourceLabel("mock")).toBe("Mock");
  });

  it("warns only when music provider falls back to mock", () => {
    expect(shouldWarnOnMockMusic("mock")).toBe(true);
    expect(shouldWarnOnMockMusic("ready")).toBe(false);
  });

  it("computes faded volume with linear interpolation", () => {
    expect(computeFadedVolume(1.0, 0.2, 300, 0)).toBeCloseTo(1.0, 5);
    expect(computeFadedVolume(1.0, 0.2, 300, 150)).toBeCloseTo(0.6, 5);
    expect(computeFadedVolume(1.0, 0.2, 300, 300)).toBeCloseTo(0.2, 5);
    expect(computeFadedVolume(1.0, 0.2, 300, 600)).toBeCloseTo(0.2, 5);
  });

  it("labels story types in Chinese", () => {
    expect(getStoryTypeLabel("background")).toBe("创作背景");
    expect(getStoryTypeLabel("lyric-theme")).toBe("歌词主题");
    expect(getStoryTypeLabel("mood-reading")).toBe("氛围解读");
  });

  it("labels source kinds in Chinese", () => {
    expect(getSourceKindLabel("lyric")).toBe("歌词");
    expect(getSourceKindLabel("metadata")).toBe("元数据");
    expect(getSourceKindLabel("web")).toBe("网页");
    expect(getSourceKindLabel("mock")).toBe("Mock");
  });

  it("returns story source descriptions for non-background types", () => {
    expect(getStorySourceDescription("background")).toBeNull();
    expect(getStorySourceDescription("lyric-theme")).toBe("当前故事基于歌词主题解读，非真实创作背景");
    expect(getStorySourceDescription("mood-reading")).toBe("当前故事基于听感解读，非真实创作背景");
  });

  it("clamps faded volume to [0, 1] range", () => {
    expect(computeFadedVolume(-0.5, 0.5, 100, 0)).toBe(0);
    expect(computeFadedVolume(0.5, 1.5, 100, 100)).toBe(1);
    expect(computeFadedVolume(-0.3, -0.1, 100, 100)).toBe(0);
    expect(computeFadedVolume(1.2, 1.5, 100, 100)).toBe(1);
    expect(computeFadedVolume(0.3, 0.8, 100, 50)).toBeCloseTo(0.55, 5);
  });
});

describe("episode state machine", () => {
  it.each([
    ["idle", "PLAY", "preparing"],
    ["preparing", "LOAD_SUCCESS", "story"],
    ["preparing", "LOAD_ERROR", "error"],
    ["preparing", "SPEECH_ENDED", "music"],
    ["preparing", "SPEECH_ERROR", "error"],
    ["story", "CROSSFADE_START", "crossfade"],
    ["story", "SPEECH_ENDED", "music"],
    ["story", "SPEECH_ERROR", "error"],
    ["crossfade", "SPEECH_ENDED", "music"],
    ["crossfade", "SPEECH_ERROR", "error"],
    ["music", "PLAY", "preparing"],
    ["error", "RETRY", "preparing"]
  ] satisfies [EpisodePlaybackState, EpisodeEvent, EpisodePlaybackState][])(
    "transitions from %s via %s to %s",
    (current, event, expected) => {
      expect(transitEpisodeState(current, event)).toBe(expected);
    }
  );

  it.each([
    ["idle", "LOAD_SUCCESS"],
    ["idle", "LOAD_ERROR"],
    ["idle", "CROSSFADE_START"],
    ["idle", "SPEECH_ENDED"],
    ["idle", "SPEECH_ERROR"],
    ["idle", "RETRY"],
    ["preparing", "PLAY"],
    ["preparing", "CROSSFADE_START"],
    ["preparing", "RETRY"],
    ["story", "PLAY"],
    ["story", "LOAD_SUCCESS"],
    ["story", "LOAD_ERROR"],
    ["story", "RETRY"],
    ["crossfade", "PLAY"],
    ["crossfade", "LOAD_SUCCESS"],
    ["crossfade", "LOAD_ERROR"],
    ["crossfade", "CROSSFADE_START"],
    ["crossfade", "RETRY"],
    ["music", "LOAD_SUCCESS"],
    ["music", "LOAD_ERROR"],
    ["music", "CROSSFADE_START"],
    ["music", "SPEECH_ENDED"],
    ["music", "SPEECH_ERROR"],
    ["music", "RETRY"],
    ["error", "PLAY"],
    ["error", "LOAD_SUCCESS"],
    ["error", "LOAD_ERROR"],
    ["error", "CROSSFADE_START"],
    ["error", "SPEECH_ENDED"],
    ["error", "SPEECH_ERROR"]
  ] satisfies [EpisodePlaybackState, EpisodeEvent][])(
    "rejects invalid transition from %s via %s",
    (current, event) => {
      expect(() => transitEpisodeState(current, event)).toThrow();
    }
  );

  it("labels episode states in Chinese", () => {
    expect(getEpisodeStateLabel("idle")).toBe("待机");
    expect(getEpisodeStateLabel("preparing")).toBe("准备中");
    expect(getEpisodeStateLabel("story")).toBe("口播中");
    expect(getEpisodeStateLabel("crossfade")).toBe("音乐渐入");
    expect(getEpisodeStateLabel("music")).toBe("播放中");
    expect(getEpisodeStateLabel("error")).toBe("播放异常");
  });
});

describe("shouldStartCrossfade", () => {
  it("returns true when remaining time is within offset", () => {
    // 5s remaining <= 5000ms offset
    expect(shouldStartCrossfade(55, 60, 5000)).toBe(true);
    // exactly at boundary
    expect(shouldStartCrossfade(57, 60, 3000)).toBe(true);
  });

  it("returns false when remaining time exceeds offset", () => {
    expect(shouldStartCrossfade(10, 60, 5000)).toBe(false);
    expect(shouldStartCrossfade(0, 180, 3000)).toBe(false);
  });

  it("returns true when story is shorter than offset (crossfade starts immediately)", () => {
    expect(shouldStartCrossfade(0, 1, 3000)).toBe(true);
  });

  it("returns false for unknown duration (NaN)", () => {
    expect(shouldStartCrossfade(0, NaN, 3000)).toBe(false);
  });

  it("returns false for infinite duration", () => {
    expect(shouldStartCrossfade(0, Infinity, 3000)).toBe(false);
  });

  it("returns false when duration is 0", () => {
    expect(shouldStartCrossfade(0, 0, 3000)).toBe(false);
  });

  it("returns false for NaN currentTime", () => {
    expect(shouldStartCrossfade(NaN, 60, 3000)).toBe(false);
  });
});

describe("getNextEpisodeLabel", () => {
  it("returns empty string when nothing is happening", () => {
    expect(getNextEpisodeLabel(false, false, false)).toBe("");
  });

  it("returns prefetching label when prefetch is in progress", () => {
    expect(getNextEpisodeLabel(false, false, true)).toBe("下一集预备中");
  });

  it("returns ready label when next episode is available", () => {
    expect(getNextEpisodeLabel(false, true, false)).toBe("下一集已就绪");
  });

  it("returns ready label when both episode and prefetching (episode available wins)", () => {
    expect(getNextEpisodeLabel(false, true, true)).toBe("下一集已就绪");
  });

  it("returns error label when prefetch failed (error takes priority over prefetching)", () => {
    expect(getNextEpisodeLabel(true, false, true)).toBe("下一集预备失败");
  });

  it("returns error label when prefetch failed and not fetching", () => {
    expect(getNextEpisodeLabel(true, false, false)).toBe("下一集预备失败");
  });

  it("returns error label when error exists even if episode is available (error wins)", () => {
    expect(getNextEpisodeLabel(true, true, false)).toBe("下一集预备失败");
  });
});
