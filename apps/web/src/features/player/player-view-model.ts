import type { NowResponse } from "@fakeradio/shared";

export function getPlaybackLabel(playback: NowResponse["playback"]) {
  const labels: Record<NowResponse["playback"], string> = {
    idle: "待机",
    playing: "播放中",
    paused: "已暂停",
    buffering: "缓冲中"
  };
  return labels[playback];
}

export function formatDuration(durationMs: number | undefined) {
  if (durationMs === undefined) {
    return "未知时长";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
