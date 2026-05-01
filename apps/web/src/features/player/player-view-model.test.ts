import { describe, expect, it } from "vitest";
import {
  computeFadedVolume,
  formatDuration,
  getPlaybackLabel,
  getProviderStatusLabel,
  getTrackSourceLabel,
  shouldWarnOnMockMusic
} from "./player-view-model";

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
});
