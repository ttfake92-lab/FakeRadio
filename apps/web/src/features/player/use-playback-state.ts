"use client";

import type { EpisodeNextResponse, RadioEpisode } from "@fakeradio/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiUrl, buildMediaUrl, getNextEpisode } from "../../lib/api-client";
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
  error: string | null;
  episodeStateLabel: string;
  nextEpisodeLabel: string;
  musicAudioUrl: string | undefined;
  playEpisode(): Promise<void>;
  setError(error: string | null): void;
  clearEpisodeState(): void;
};

export function usePlaybackState(audio: AudioEngine): PlaybackState {
  const [episodeState, setEpisodeState] = useState<EpisodePlaybackState>("idle");
  const [episodeData, setEpisodeData] = useState<RadioEpisode | null>(null);
  const [nextEpisode, setNextEpisode] = useState<RadioEpisode | null>(null);
  const [nextEpisodeError, setNextEpisodeError] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextEpisodeRef = useRef<RadioEpisode | null>(null);
  const isPrefetchingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeUpdateRef = useRef<(() => void) | null>(null);

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

    musicAudio.src = buildApiUrl(`/api/audio/${episode.track.id}`);
    musicAudio.volume = 0;

    speechAudio.src = buildMediaUrl(episode.story.audioUrl) ?? "";

    let crossfadeStarted = false;

    const onTimeUpdate = () => {
      if (crossfadeStarted) return;
      if (shouldStartCrossfade(speechAudio.currentTime, speechAudio.duration, episode.playback.crossfadeStartOffsetMs)) {
        crossfadeStarted = true;
        setEpisodeState((current) => transitEpisodeStateSafely(current, "CROSSFADE_START"));

        musicAudio.volume = episode.playback.musicStartVolume;
        musicAudio.play().catch(() => {});
        audio.fadeVolume(musicAudio, 1.0, episode.playback.crossfadeStartOffsetMs);
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
        ma.volume = 1.0;
        ma.play().catch(() => {});
      }
    };

    speechAudio.onerror = () => {
      const ma = audio.musicRef.current;
      if (ma && !ma.paused) {
        audio.fadeVolume(ma, 1.0, 300);
      }
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
      setError("口播加载失败");
      speechAudio.removeEventListener("timeupdate", onTimeUpdate);
    };

    musicAudio.onended = () => {
      const next = nextEpisodeRef.current;
      if (next) {
        nextEpisodeRef.current = null;
        setNextEpisode(null);
        setNextEpisodeError(null);
        playEpisodeData(next);
        return;
      }

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
            } else {
              setEpisodeState("idle");
            }
          }
        }, 100);
        pollIntervalRef.current = pollInterval;
        setTimeout(() => {
          if (pollIntervalRef.current === pollInterval) {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            setEpisodeState("idle");
          }
        }, 30_000);
        return;
      }

      setEpisodeState("idle");
    };

    speechAudio.play().then(() => {
      try {
        setEpisodeState((current) => transitEpisodeStateSafely(current, "LOAD_SUCCESS"));
      } catch {
        // state already changed, ignore
      }
    }).catch(() => {
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
      setError("口播加载失败");
    });
  }

  const playEpisode = useCallback(async () => {
    if (episodeState !== "idle" && episodeState !== "error" && episodeState !== "music") return;

    isPrefetchingRef.current = false;
    setIsPrefetching(false);
    nextEpisodeRef.current = null;
    setNextEpisode(null);
    setNextEpisodeError(null);
    setError(null);

    try {
      const response: EpisodeNextResponse = await getNextEpisode();
      playEpisodeData(response.episode);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid episode state transition")) {
        setEpisodeState("error");
        setError("状态转换异常，请刷新页面重试");
        return;
      }
      setEpisodeState("error");
      setEpisodeData(null);
      setError(`播放失败：${getErrorMessage(err)}`);
    }
  }, [episodeState]);

  const prefetchNextEpisode = useCallback(async () => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;
    setIsPrefetching(true);
    setNextEpisodeError(null);

    try {
      const response = await getNextEpisode();
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
    setEpisodeState("idle");
    setEpisodeData(null);
    setNextEpisode(null);
    setNextEpisodeError(null);
    setError(null);
  }, []);

  return {
    episodeState,
    episodeData,
    nextEpisode,
    nextEpisodeError,
    isPrefetching,
    error,
    episodeStateLabel,
    nextEpisodeLabel,
    musicAudioUrl,
    playEpisode,
    setError,
    clearEpisodeState
  };
}
