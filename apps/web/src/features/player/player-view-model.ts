import type { EpisodeNextResponse, HealthResponse, NowResponse, StorySourceNote, StoryType, Track } from "@fakeradio/shared";
export {
  type EpisodePlaybackState,
  type EpisodeEvent,
  transitEpisodeState,
  transitEpisodeStateSafely,
  getEpisodeStateLabel
} from "./episode-state-machine";

export type AdapterStatus = "ready" | "disabled" | "error";

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

export function getProviderStatusLabel(status: AdapterStatus) {
  const labels: Record<AdapterStatus, string> = {
    ready: "真实来源已连接",
    disabled: "未配置",
    error: "连接异常"
  };

  return labels[status];
}

export function getTrackSourceLabel(source: Track["source"]) {
  const labels: Record<Track["source"], string> = {
    netease: "网易云",
    local: "本地"
  };

  return labels[source];
}

export function shouldWarnOnMockMusic(status: AdapterStatus) {
  return status === "disabled" || status === "error";
}

export function computeFadedVolume(
  startVolume: number,
  targetVolume: number,
  durationMs: number,
  elapsedMs: number
): number {
  const progress = Math.min(elapsedMs / durationMs, 1);
  const raw = startVolume + (targetVolume - startVolume) * progress;
  return Math.max(0, Math.min(1, raw));
}

export function getStoryTypeLabel(type: StoryType) {
  const labels: Record<StoryType, string> = {
    background: "创作背景",
    "lyric-theme": "歌词主题",
    "mood-reading": "情绪解读"
  };

  return labels[type];
}

export function getSourceKindLabel(kind: StorySourceNote["kind"]) {
  const labels: Record<StorySourceNote["kind"], string> = {
    lyric: "歌词",
    metadata: "元数据",
    web: "网页"
  };

  return labels[kind];
}

export function getStorySourceDescription(type: StoryType): string | null {
  switch (type) {
    case "background":
      return null;
    case "lyric-theme":
      return "当前故事基于歌词主题解读，非真实创作背景";
    case "mood-reading":
      return "当前故事基于听感解读，非真实创作背景";
  }
  return null;
}

export function getNextEpisodeLabel(
  hasError: boolean,
  hasEpisode: boolean,
  isPrefetching: boolean
): string {
  if (hasError) return "下一集预备失败";
  if (hasEpisode) return "下一集已就绪";
  if (isPrefetching) return "下一集预备中";
  return "";
}

export function getPlaybackControlText(
  isLoading: boolean,
  isPlaying: boolean,
  playText: string,
  pauseText: string,
  loadingText: string
): string {
  if (isLoading) return loadingText;
  return isPlaying ? pauseText : playText;
}

export function shouldStartCrossfade(
  currentTimeSec: number,
  durationSec: number,
  crossfadeStartOffsetMs: number
): boolean {
  if (!isFinite(currentTimeSec) || !isFinite(durationSec) || durationSec <= 0) return false;
  const remainingMs = (durationSec - currentTimeSec) * 1000;
  return remainingMs <= crossfadeStartOffsetMs;
}

export type OnAirClock = {
  time: string;
  weekday: string;
  date: string;
};

export type StreamConnectionState = "connected" | "connecting" | "disconnected";

export function buildOnAirClock(date: Date, timeZone?: string): OnAirClock {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone
  });
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    timeZone
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone
  });
  const yearFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone
  });

  return {
    time: timeFormatter.format(date),
    weekday: weekdayFormatter.format(date),
    date: `${dayFormatter.format(date)}·${monthFormatter.format(date).toUpperCase()}·${yearFormatter.format(date)}`
  };
}

export function getOnAirModeLabel(hour: number): string {
  if (hour >= 7 && hour < 9) return "Morning";
  if (hour >= 9 && hour < 12) return "Focus";
  if (hour >= 14 && hour < 18) return "Afternoon";
  if (hour >= 21 || hour < 7) return "Night";
  return "On Air";
}

export function getQueueCountLabel(count: number): string {
  return `${count} ${count === 1 ? "TRACK" : "TRACKS"}`;
}

export function getConnectionLabel(state: StreamConnectionState): string {
  const labels: Record<StreamConnectionState, string> = {
    connected: "CONNECTED",
    connecting: "CONNECTING",
    disconnected: "OFFLINE"
  };
  return labels[state];
}

export function getDjMessageText(message: string | undefined): string {
  const trimmed = message?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : "FakeRadio 已连接。告诉 DJ 你想进入什么状态。";
}
