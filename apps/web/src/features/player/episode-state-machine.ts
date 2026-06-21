// Episode 播放状态机：状态定义、事件、转移表、转移函数。
// 被 use-playback-state hook 驱动，是播放管线承重部分。

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
