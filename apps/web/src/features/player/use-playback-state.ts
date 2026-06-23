"use client";

import type { EpisodeNextResponse, RadioEpisode } from "@fakeradio/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiUrl, buildMediaUrl, getNextEpisode, prefetchNextEpisode as prefetchNextEpisodeApi, reportEpisodePlaying } from "../../lib/api-client";
import {
  getEpisodeStateLabel,
  getNextEpisodeLabel,
  shouldStartCrossfade,
  transitEpisodeStateSafely
} from "./player-view-model";
import type { EpisodePlaybackState } from "./player-view-model";
import type { AudioEngine } from "./use-audio-engine";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export type PlaybackState = {
  episodeState: EpisodePlaybackState;
  episodeData: RadioEpisode | null;
  nextEpisode: RadioEpisode | null;
  nextEpisodeError: string | null;
  isPrefetching: boolean;
  isLoadingEpisode: boolean;
  error: string | null;
  episodeStateLabel: string;
  nextEpisodeLabel: string;
  musicAudioUrl: string | undefined;
  episodeSource: "prepared" | "live" | null;
  playEpisode(): Promise<void>;
  skipToNext(): Promise<void>;
  setError(error: string | null): void;
  clearEpisodeState(): void;
  // 用户在 DJ 聊天点"插到下一首"后调用：丢掉已预取的（可能是旧推荐）下一首，
  // 重新预取——服务端会优先返回刚插入的曲目，这样 UP NEXT 立刻显示并播对。
  refreshPrefetch(): Promise<void>;
};

export function usePlaybackState(audio: AudioEngine): PlaybackState {
  const [episodeState, setEpisodeState] = useState<EpisodePlaybackState>("idle");
  const [episodeData, setEpisodeData] = useState<RadioEpisode | null>(null);
  const [nextEpisode, setNextEpisode] = useState<RadioEpisode | null>(null);
  const [nextEpisodeError, setNextEpisodeError] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodeSource, setEpisodeSource] = useState<"prepared" | "live" | null>(null);

  const nextEpisodeRef = useRef<RadioEpisode | null>(null);
  const isPrefetchingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeUpdateRef = useRef<(() => void) | null>(null);
  const episodeStateRef = useRef<EpisodePlaybackState>(episodeState);
  // skipToNext 是后定义的 useCallback，playEpisodeData 闭包直接引用会陈旧，
  // 用 ref 持有最新值，供 speechAudio.onerror 自动切歌。
  const skipToNextRef = useRef<() => void>(() => {});
  // 连续口播失败计数：超过阈值就停在 error，避免无限切歌死循环。
  const speechErrorCountRef = useRef(0);

  episodeStateRef.current = episodeState;

  const episodeStateLabel = getEpisodeStateLabel(episodeState);
  const nextEpisodeLabel = getNextEpisodeLabel(nextEpisodeError !== null, nextEpisode !== null, isPrefetching);
  const musicAudioUrl = episodeData ? buildApiUrl(`/api/audio/${episodeData.track.id}`) : undefined;

  function playEpisodeData(episode: RadioEpisode) {
    const speechAudio = audio.speechRef.current;
    const musicAudio = audio.musicRef.current;
    if (!speechAudio || !musicAudio) {
      setEpisodeState("error");
      setError("播放器未就绪");
      return;
    }

    setEpisodeData(episode);
    setEpisodeState("preparing");

    // 先停掉旧音频再设新 src：防止切歌瞬间两段音频并行（旧口播/旧音乐尾音 +
    // 新口播），是"两个音频打架"的根因之一。clearEpisodeState 已做同样清理，
    // 但 playNextEpisode 秒切路径直接进 playEpisodeData，绕过了它。
    musicAudio.pause();
    speechAudio.pause();

    musicAudio.src = buildApiUrl(`/api/audio/${episode.track.id}`);
    musicAudio.volume = 0;
    // 口播音量跟随用户设置（之前没人写它 → 音量条对口播无效）。
    speechAudio.volume = audio.getUserVolume();

    // 音频源加载失败（如网易云 URL 过期、未登录）时显式提示，
    // 不再无声卡住；口播不中断，用户可点 NEXT 换一首
    musicAudio.onerror = () => {
      setError(`音乐加载失败：${episode.track.title}。可尝试 NEXT 换一首，或检查网易云登录状态`);
    };

    speechAudio.src = buildMediaUrl(episode.story.audioUrl) ?? "";

    let crossfadeStarted = false;

    const onTimeUpdate = () => {
      if (crossfadeStarted) return;
      if (shouldStartCrossfade(speechAudio.currentTime, speechAudio.duration, episode.playback.crossfadeStartOffsetMs)) {
        crossfadeStarted = true;
        setEpisodeState((current) => transitEpisodeStateSafely(current, "CROSSFADE_START"));

        // crossfade 起步/目标都按用户音量缩放，否则用户调的音量会被覆盖。
        const userVol = audio.getUserVolume();
        musicAudio.volume = episode.playback.musicStartVolume * userVol;
        musicAudio.play().catch(() => {});
        audio.fadeVolume(musicAudio, userVol, episode.playback.crossfadeStartOffsetMs);
      }
    };

    if (onTimeUpdateRef.current) {
      speechAudio.removeEventListener("timeupdate", onTimeUpdateRef.current);
    }
    speechAudio.addEventListener("timeupdate", onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;

    speechAudio.onended = () => {
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ENDED"));
      speechAudio.removeEventListener("timeupdate", onTimeUpdate);
      const ma = audio.musicRef.current;
      if (ma) {
        ma.volume = audio.getUserVolume();
        ma.play().catch(() => {});
      }
    };

    speechAudio.onerror = () => {
      speechAudio.removeEventListener("timeupdate", onTimeUpdate);
      speechErrorCountRef.current += 1;
      if (speechErrorCountRef.current >= 3) {
        // 连续失败：不再自动切，停在 error 让用户感知（网络/TTS 服务可能挂了）。
        setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
        const ma = audio.musicRef.current;
        if (ma && !ma.paused) audio.fadeVolume(ma, audio.getUserVolume(), 300);
        setError("连续多首口播加载失败，请检查网络或 TTS 服务");
      } else {
        // 偶发失败：静默切下一首，skipToNext 的 loading 状态自带反馈，
        // 不设 error（playEpisode 开头会清 error，设了也白设）。
        void skipToNextRef.current();
      }
    };

    musicAudio.onended = () => {
      if (playNextEpisode()) return;

      if (isPrefetchingRef.current) {
        const pollInterval = setInterval(() => {
          if (!isPrefetchingRef.current) {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            const n = nextEpisodeRef.current;
            if (n) {
              nextEpisodeRef.current = null;
              setNextEpisode(null);
              setNextEpisodeError(null);
              playEpisodeData(n);
              reportEpisodePlaying(n.track.id).catch(() => {});
            } else {
              musicAudio.pause();
              musicAudio.currentTime = 0;
              setEpisodeState("idle");
            }
          }
        }, 100);
        pollIntervalRef.current = pollInterval;
        setTimeout(() => {
          if (pollIntervalRef.current === pollInterval) {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            musicAudio.pause();
            musicAudio.currentTime = 0;
            setEpisodeState("idle");
          }
        }, 30_000);
        return;
      }

      musicAudio.pause();
      musicAudio.currentTime = 0;
      setEpisodeState("idle");
    };

    speechAudio.play().then(() => {
      try {
        setEpisodeState((current) => transitEpisodeStateSafely(current, "LOAD_SUCCESS"));
        speechErrorCountRef.current = 0;
      } catch {
        // state already changed, ignore
      }
    }).catch(() => {
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
      setError("口播加载失败");
    });
  }

  const playEpisode = useCallback(async () => {
    if (episodeStateRef.current !== "idle" && episodeStateRef.current !== "error" && episodeStateRef.current !== "music") return;

    // iOS/iPadOS：在 await 网络请求之前（仍在用户手势同步栈内）解锁音频元素，
    // 否则跨过 await 后 play() 会被自动播放策略拦截，报"口播加载失败"
    audio.unlock();

    episodeStateRef.current = "preparing";
    setEpisodeState("preparing");
    setIsLoadingEpisode(true);
    isPrefetchingRef.current = false;
    setIsPrefetching(false);
    nextEpisodeRef.current = null;
    setNextEpisode(null);
    setNextEpisodeError(null);
    setError(null);

    try {
      const response: EpisodeNextResponse = await getNextEpisode();
      playEpisodeData(response.episode);
      setEpisodeSource(response.source);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid episode state transition")) {
        setEpisodeState("error");
        setError("状态转换异常，请刷新页面重试");
        throw err;
      }
      setEpisodeState("error");
      setEpisodeData(null);
      setError(`播放失败：${getErrorMessage(err)}`);
      throw err;
    } finally {
      setIsLoadingEpisode(false);
    }
  }, [episodeState]);

  // 切到已预取的下一首（秒切，无需等待生成）。手动 NEXT 和自动 onended 共用，
  // 避免两条路径不一致。返回 false 表示没有预取可用，调用方自行 fallback。
  function playNextEpisode(): boolean {
    const next = nextEpisodeRef.current;
    if (!next) return false;
    nextEpisodeRef.current = null;
    setNextEpisode(null);
    setNextEpisodeError(null);
    playEpisodeData(next);
    // 预取的 episode 是前端自行接续的，必须上报服务端，
    // 否则服务端"当前曲目"停留在上一首，DJ 聊天会聊错歌
    reportEpisodePlaying(next.track.id).catch(() => {});
    return true;
  }


  const prefetchNextEpisode = useCallback(async () => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;
    setIsPrefetching(true);
    setNextEpisodeError(null);

    try {
      const response = await prefetchNextEpisodeApi();
      if (!isPrefetchingRef.current) return;
      nextEpisodeRef.current = response.episode;
      setNextEpisode(response.episode);
    } catch (err) {
      if (!isPrefetchingRef.current) return;
      nextEpisodeRef.current = null;
      setNextEpisode(null);
      setNextEpisodeError(getErrorMessage(err));
    } finally {
      isPrefetchingRef.current = false;
      setIsPrefetching(false);
    }
  }, []);

  useEffect(() => {
    if (episodeState === "music") {
      prefetchNextEpisode();
    }
  }, [episodeState, prefetchNextEpisode]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      const sa = audio.speechRef.current;
      if (sa && onTimeUpdateRef.current) {
        sa.removeEventListener("timeupdate", onTimeUpdateRef.current);
        onTimeUpdateRef.current = null;
      }
    };
  }, []);

  const clearEpisodeState = useCallback(() => {
    // 连音频元素一起清空：否则残留的旧 src 会被 unlock() 的 play() 重新触发，
    // 表现为"切下一首时旧口播又播一遍"
    const ma = audio.musicRef.current;
    const sa = audio.speechRef.current;
    if (ma) { ma.pause(); ma.removeAttribute("src"); ma.load(); }
    if (sa) { sa.pause(); sa.removeAttribute("src"); sa.load(); }
    episodeStateRef.current = "idle";
    setEpisodeState("idle");
    setEpisodeData(null);
    setNextEpisode(null);
    setNextEpisodeError(null);
    setIsLoadingEpisode(false);
    setError(null);
    setEpisodeSource(null);
  }, []);

  // 手动 NEXT：优先用预取秒切；预取进行中则等待它完成（而非打断重新生成）；
  // 既无预取也未在预取，才清状态现生成。
  const skipToNext = useCallback(async () => {
    if (playNextEpisode()) return;
    if (isPrefetchingRef.current) {
      // 预取进行中：给可见反馈，轮询等待结果秒切，避免放弃预取重新生成。
      setIsLoadingEpisode(true);
      const ready = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 8000;
        const poll = setInterval(() => {
          if (nextEpisodeRef.current) {
            clearInterval(poll);
            resolve(true);
          } else if (!isPrefetchingRef.current || Date.now() > deadline) {
            clearInterval(poll);
            resolve(false);
          }
        }, 100);
      });
      if (ready && playNextEpisode()) {
        setIsLoadingEpisode(false);
        return;
      }
      setIsLoadingEpisode(false);
    }
    clearEpisodeState();
    await playEpisode();
  }, [clearEpisodeState, playEpisode]);
  skipToNextRef.current = skipToNext;

  const refreshPrefetch = useCallback(async () => {
    // 先等正在进行的预取结束，否则它的旧结果会在我们清空后覆盖回来。
    if (isPrefetchingRef.current) {
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (!isPrefetchingRef.current) {
            clearInterval(poll);
            resolve();
          }
        }, 50);
      });
    }
    nextEpisodeRef.current = null;
    setNextEpisode(null);
    setNextEpisodeError(null);
    await prefetchNextEpisode();
  }, [prefetchNextEpisode]);

  return {
    episodeState,
    episodeData,
    nextEpisode,
    nextEpisodeError,
    isPrefetching,
    isLoadingEpisode,
    error,
    episodeStateLabel,
    nextEpisodeLabel,
    musicAudioUrl,
    episodeSource,
    playEpisode,
    skipToNext,
    setError,
    clearEpisodeState,
    refreshPrefetch
  };
}
