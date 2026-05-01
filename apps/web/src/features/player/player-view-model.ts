import type { EpisodeNextResponse, HealthResponse, NowResponse, StoryType, Track } from "@fakeradio/shared";

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

export function getProviderStatusLabel(status: HealthResponse["adapters"]["music"]) {
  const labels: Record<HealthResponse["adapters"]["music"], string> = {
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

export function shouldWarnOnMockMusic(status: HealthResponse["adapters"]["music"]) {
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
    "mood-reading": "氛围解读"
  };

  return labels[type];
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
