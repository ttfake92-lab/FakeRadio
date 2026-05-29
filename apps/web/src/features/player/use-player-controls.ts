"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatResponse, FavoriteTrack, HealthResponse, NowResponse, PrewarmStatus, Track } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import type { AudioEngine } from "./use-audio-engine";
import type { PlaybackState } from "./use-playback-state";
import { getNow, getHealth, getFavorites, getPrewarmStatus, sendChat, addFavorite, removeFavorite } from "../../lib/api-client";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getMusicStatus(health: HealthResponse | null) {
  const status = health?.adapters.music;
  return typeof status === "string" ? status : "mock";
}

/**
 * 管理播放器控制逻辑和关联的运行时状态。
 * 包含：播放控制、收藏、聊天、轮询和时钟。
 */
export function usePlayerControls(audio: AudioEngine, playback: PlaybackState) {
  const [now, setNow] = useState<NowResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [isActing, setIsActing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<ChatResponse | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [userChatHistory, setUserChatHistory] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [prewarmStatus, setPrewarmStatus] = useState<PrewarmStatus | null>(null);
  const [nowDate, setNowDate] = useState(() => new Date());

  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioTimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const track: Track | null = now?.track ?? playback.episodeData?.track ?? null;
  const musicStatus = getMusicStatus(health);
  const isFavorited = track !== null && favorites.some((f) => f.trackId === track.id);

  /** 加载初始数据（不含 production 数据） */
  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, healthResponse, favoritesResponse, prewarmStatusResponse] = await Promise.all([
        getNow(),
        getHealth(),
        getFavorites(),
        getPrewarmStatus().catch(() => null),
      ]);
      setNow(nowResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
      setPrewarmStatus(prewarmStatusResponse);
    } catch (loadError) {
      playback.setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, [playback]);

  // Clock auto-update every second
  useEffect(() => {
    clockIntervalRef.current = setInterval(() => {
      setNowDate(new Date());
    }, 1000);
    return () => {
      if (clockIntervalRef.current !== null) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    };
  }, []);

  // Audio time polling when playing
  useEffect(() => {
    if (!isPlaying) {
      if (audioTimeRef.current !== null) {
        clearInterval(audioTimeRef.current);
        audioTimeRef.current = null;
      }
      return;
    }
    audioTimeRef.current = setInterval(() => {
      const musicAudio = audio.musicRef.current;
      if (musicAudio) {
        setCurrentTime(musicAudio.currentTime);
      }
    }, 500);
    return () => {
      if (audioTimeRef.current !== null) {
        clearInterval(audioTimeRef.current);
        audioTimeRef.current = null;
      }
    };
  }, [isPlaying, audio.musicRef]);

  const handleNext = useCallback(async () => {
    try {
      audio.musicRef.current?.pause();
      audio.speechRef.current?.pause();
      playback.clearEpisodeState();
      await playback.playEpisode();
      setIsPlaying(true);
    } catch (nextError) {
      playback.setError(`生成下一首失败：${getErrorMessage(nextError)}`);
      setIsPlaying(false);
    } finally {
      setIsActing(false);
    }
  }, [audio.musicRef, audio.speechRef, playback]);

  const handlePlayPause = useCallback(async () => {
    if (playback.episodeState === "idle" || playback.episodeState === "error") {
      playback.setError(null);
      try {
        await playback.playEpisode();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    const musicAudio = audio.musicRef.current;
    if (!musicAudio || musicAudio.readyState < 2) return;
    if (musicAudio.paused) {
      musicAudio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      musicAudio.pause();
      setIsPlaying(false);
    }
    setCurrentTime(musicAudio.currentTime);
  }, [playback.episodeState, playback.playEpisode, playback.error, audio.musicRef]);

  const handleReplay = useCallback(() => {
    const speechAudio = audio.speechRef.current;
    if (speechAudio && speechAudio.src) {
      speechAudio.currentTime = 0;
      speechAudio.play().catch(() => {});
    }
  }, [audio.speechRef]);

  const handleSeek = useCallback(
    (pos01: number) => {
      const musicAudio = audio.musicRef.current;
      if (musicAudio && musicAudio.duration) {
        musicAudio.currentTime = pos01 * musicAudio.duration;
        setCurrentTime(musicAudio.currentTime);
      }
    },
    [audio.musicRef],
  );

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      const musicAudio = audio.musicRef.current;
      if (musicAudio) {
        musicAudio.volume = newVolume;
      }
    },
    [audio.musicRef],
  );

  const submitChatMessage = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (message.length === 0) return;

      setIsActing(true);
      playback.setError(null);
      setChatReply(null);
      setUserChatHistory((prev) => [...prev.slice(-4), message]);
      try {
        const reply = await sendChat(message);
        setChatReply(reply);
        if (reply.message) {
          setAgentMessages((prev) => [
            ...prev.slice(-19),
            { role: "agent", text: reply.message, trackId: track?.id ?? "" },
          ]);
        }
        setChatMessage("");

        // Execute action if returned
        if (reply.action?.type === "next-track") {
          const nowRes = await getNow();
          setNow(nowRes);
        } else if (reply.action?.type === "add-favorite" && reply.action.trackId) {
          setFavorites((prev) => {
            if (prev.some((f) => f.trackId === reply.action!.trackId)) return prev;
            return [
              ...prev,
              {
                trackId: reply.action!.trackId!,
                title: reply.action!.title ?? "",
                artist: reply.action!.artist ?? "",
                favoritedAt: new Date().toISOString(),
              },
            ];
          });
        }
      } catch (chatError) {
        playback.setError(`发送失败：${getErrorMessage(chatError)}`);
      } finally {
        setIsActing(false);
      }
    },
    [track],
  );

  const handleChat = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submitChatMessage(chatMessage);
    },
    [submitChatMessage, chatMessage],
  );

  const handleToggleFavorite = useCallback(async () => {
    if (track === null) return;
    setIsActing(true);
    try {
      if (isFavorited) {
        await removeFavorite(track.id);
        setFavorites((prev) => prev.filter((f) => f.trackId !== track.id));
      } else {
        const favPayload: { trackId: string; title: string; artist: string; album?: string } = {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
        };
        if (track.album !== undefined) favPayload.album = track.album;
        const { favorite } = await addFavorite(favPayload);
        setFavorites((prev) => [
          ...prev,
          { ...favorite, title: track.title, artist: track.artist, album: track.album },
        ]);
      }
    } catch (favError) {
      playback.setError(`收藏操作失败：${getErrorMessage(favError)}`);
    } finally {
      setIsActing(false);
    }
  }, [track, isFavorited, playback]);

  return {
    // Now / health state
    now,
    setNow,
    health,
    setHealth,
    track,
    musicStatus,
    isFavorited,
    isLoading,
    prewarmStatus,
    nowDate,
    // Player runtime state
    favorites,
    setFavorites,
    isActing,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    // Chat state
    chatMessage,
    setChatMessage,
    chatReply,
    agentMessages,
    setAgentMessages,
    userChatHistory,
    // Polling
    pollIntervalRef,
    // Controls
    loadDashboard,
    handleNext,
    handlePlayPause,
    handleReplay,
    handleSeek,
    handleVolumeChange,
    submitChatMessage,
    handleChat,
    handleToggleFavorite,
  };
}
