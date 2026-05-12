import type { EpisodeNextResponse, HealthResponse, NowResponse, StorySourceNote, StoryType, Track } from "@fakeradio/shared";

export type AdapterStatus = "mock" | "ready" | "disabled";

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
    mock: "已回退到 mock",
    disabled: "已禁用"
  };

  return labels[status];
}

export function getTrackSourceLabel(source: Track["source"]) {
  const labels: Record<Track["source"], string> = {
    netease: "网易云",
    mock: "Mock",
    local: "本地"
  };

  return labels[source];
}

export function shouldWarnOnMockMusic(status: AdapterStatus) {
  return status === "mock";
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

export type EpisodePlaybackState = "idle" | "preparing" | "story" | "crossfade" | "music" | "error";

export type EpisodeEvent =
  | "PLAY"
  | "LOAD_SUCCESS"
  | "LOAD_ERROR"
  | "CROSSFADE_START"
  | "SPEECH_ENDED"
  | "SPEECH_ERROR"
  | "RETRY";

const EPISODE_TRANSITIONS: Record<EpisodePlaybackState, Partial<Record<EpisodeEvent, EpisodePlaybackState>>> = {
  idle: { PLAY: "preparing" },
  preparing: {
    LOAD_SUCCESS: "story",
    LOAD_ERROR: "error",
    SPEECH_ENDED: "music",
    SPEECH_ERROR: "error"
  },
  story: {
    CROSSFADE_START: "crossfade",
    SPEECH_ENDED: "music",
    SPEECH_ERROR: "error"
  },
  crossfade: {
    SPEECH_ENDED: "music",
    SPEECH_ERROR: "error"
  },
  music: { PLAY: "preparing" },
  error: { RETRY: "preparing" }
};

export function transitEpisodeState(
  current: EpisodePlaybackState,
  event: EpisodeEvent
): EpisodePlaybackState {
  const next = EPISODE_TRANSITIONS[current]?.[event];
  if (next === undefined) {
    throw new Error(
      `Invalid episode state transition: cannot transition from "${current}" via event "${event}"`
    );
  }
  return next;
}

export function transitEpisodeStateSafely(
  current: EpisodePlaybackState,
  event: EpisodeEvent
): EpisodePlaybackState {
  try {
    return transitEpisodeState(current, event);
  } catch {
    return current;
  }
}

export function getEpisodeStateLabel(state: EpisodePlaybackState): string {
  const labels: Record<EpisodePlaybackState, string> = {
    idle: "待机",
    preparing: "准备中",
    story: "口播中",
    crossfade: "音乐渐入",
    music: "播放中",
    error: "播放异常"
  };
  return labels[state];
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
    web: "网页",
    mock: "Mock"
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

export const ON_AIR_THEMES = [
  "terminal-fm",
  "morning-console",
  "amber",
  "pixel",
  "terminal",
  "bento",
  "y2k",
] as const;

export type OnAirThemeId = (typeof ON_AIR_THEMES)[number];

export type OnAirClock = {
  time: string;
  weekday: string;
  date: string;
};

export type StreamConnectionState = "connected" | "connecting" | "disconnected";

export function getThemeLabel(theme: OnAirThemeId): string {
  const labels: Record<OnAirThemeId, string> = {
    "terminal-fm": "Terminal FM",
    "morning-console": "Morning Console",
    amber: "Amber",
    pixel: "Pixel",
    terminal: "Terminal",
    bento: "Bento",
    y2k: "Y2K",
  };
  return labels[theme];
}

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
