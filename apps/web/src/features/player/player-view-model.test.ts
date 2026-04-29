import { describe, expect, it } from "vitest";
import { formatDuration, getPlaybackLabel } from "./player-view-model";

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
});
