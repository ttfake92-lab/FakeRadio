"use client";

import type { ChatResponse, FavoriteTrack, HealthResponse, NextResponse, NowResponse, PrewarmStatus } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { addFavorite, buildMediaUrl, getFavorites, getHealth, getNext, getNow, getPrewarmStatus, removeFavorite, sendChat } from "../../lib/api-client";
import {
  buildOnAirClock,
  formatDuration,
  getConnectionLabel,
  getDjMessageText,
  getOnAirModeLabel,
  getPlaybackLabel,
  getQueueCountLabel,
  shouldWarnOnMockMusic
} from "./player-view-model";
import { useAudioEngine } from "./use-audio-engine";
import { usePlaybackState } from "./use-playback-state";
import { useStreamConnection } from "./use-stream-connection";
import { OnAirTerminal } from "./on-air-terminal";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getMusicStatus(health: HealthResponse | null) {
  const status = health?.adapters.music;
  return typeof status === "string" ? status : "mock";
}

function buildNowFromNext(result: NextResponse): NowResponse {
  return {
    playback: "playing",
    track: result.track,
    dj: { say: result.decision.say, audioUrl: result.tts.audioUrl, segue: result.decision.segue },
    queue: result.queue,
    updatedAt: new Date().toISOString()
  };
}

function buildClaudioIntro(trackTitle: string, artist: string, hour: number) {
  const daypart = hour >= 21 || hour < 7 ? "late tonight" : hour < 12 ? "this morning" : hour < 18 ? "this afternoon" : "this evening";
  return `This is Claudio. ${daypart}, here is ${trackTitle} from ${artist}. Let the first line settle in, then let the song take the room. If the day has been loud, keep only the pulse you need.`;
}

export function PlayerShell() {
  const [now, setNow] = useState<NowResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [nextResult, setNextResult] = useState<NextResponse | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [userChatHistory, setUserChatHistory] = useState<string[]>([]);
  const [nowDate, setNowDate] = useState(() => new Date());
  const [theme, setTheme] = useState<"terminal-fm" | "morning-console">("terminal-fm");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem("fakeradio-volume");
    return saved !== null ? Number(saved) : 1;
  });
  const [prewarmStatus, setPrewarmStatus] = useState<PrewarmStatus | null>(null);

  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioTimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audio = useAudioEngine();
  const playback = usePlaybackState(audio);
  const { streamStatus } = useStreamConnection(
    audio,
    useCallback((payload: NowResponse) => setNow(payload), []),
    useCallback((queue: NowResponse["queue"]) => {
      setNow((current) => (current === null ? current : { ...current, queue }));
    }, []),
    useCallback((dj: NowResponse["dj"]) => {
      setNow((current) => (current === null ? current : { ...current, dj }));
    }, []),
    useCallback((msg: AgentMessage) => {
      setAgentMessages((prev) => [...prev.slice(-19), msg]);
    }, [])
  );

  const track = now?.track ?? null;
  const playbackLabel = useMemo(() => getPlaybackLabel(now?.playback ?? "idle"), [now?.playback]);
  const musicStatus = getMusicStatus(health);
  const shouldWarn = shouldWarnOnMockMusic(musicStatus);
  const isFavorited = track !== null && favorites.some((f) => f.trackId === track.id);

  const onAirClock = useMemo(() => buildOnAirClock(nowDate), [nowDate]);
  const onAirModeLabel = useMemo(() => getOnAirModeLabel(nowDate.getHours()), [nowDate]);
  const connectionState: "connected" | "connecting" | "disconnected" =
    health !== null ? "connected" : streamStatus.label === "连接中" ? "connecting" : "disconnected";
  const onAirConnectionLabel = getConnectionLabel(connectionState);
  const connectionDescription =
    connectionState === "connected"
      ? "Connected to Claudio server"
      : connectionState === "connecting"
        ? "Connecting to Claudio server..."
        : "Disconnected from Claudio server";
  const currentTrackTitle = playback.episodeData?.track.title ?? track?.title ?? "Waiting for signal";
  const currentTrackArtist = playback.episodeData?.track.artist ?? track?.artist ?? "FakeRadio";
  const currentPlaybackLabel = playback.episodeState !== "idle" ? playback.episodeStateLabel : playbackLabel;
  const djMessage = getDjMessageText(now?.dj.say ?? playback.episodeData?.story.text ?? chatReply?.message ?? buildClaudioIntro(currentTrackTitle, currentTrackArtist, nowDate.getHours()));
  const queueCountLabel = getQueueCountLabel(now?.queue?.length ?? 0);
  const nowPlayingLabel = `Now playing: ${currentTrackTitle} · ${currentTrackArtist}`;
  const durationMs = playback.episodeData?.track.durationMs ?? track?.durationMs ?? 0;
  const progress = durationMs > 0 ? currentTime / (durationMs / 1000) : 0;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, healthResponse, favoritesResponse, prewarmStatusResponse] = await Promise.all([
        getNow(), getHealth(), getFavorites(), getPrewarmStatus().catch(() => null)
      ]);
      setNow(nowResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
      setPrewarmStatus(prewarmStatusResponse);
      // Sync theme with time of day on load
      const hour = new Date().getHours();
      setTheme(hour >= 7 && hour < 9 ? "morning-console" : "terminal-fm");
    } catch (loadError) {
      playback.setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  // Initialize audio volume from saved setting
  useEffect(() => {
    const musicAudio = audio.musicRef.current;
    if (musicAudio) {
      musicAudio.volume = volume;
    }
  }, [audio.musicRef, volume]);

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

  // WebSocket fallback polling when disconnected
  useEffect(() => {
    if (streamStatus.label === "已连接" || streamStatus.label === "连接中") {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    pollIntervalRef.current = setInterval(async () => {
      try {
        const [nowRes, healthRes] = await Promise.all([getNow(), getHealth()]);
        setNow(nowRes);
        setHealth(healthRes);
      } catch {
        // silently fail polling
      }
    }, 10_000);
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [streamStatus.label]);

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
    setIsActing(true);
    playback.setError(null);
    try {
      const result = await getNext();
      setNextResult(result);
      setNow(buildNowFromNext(result));
      playback.clearEpisodeState();
      await playback.playEpisode();
    } catch (nextError) {
      playback.setError(`生成下一首失败：${getErrorMessage(nextError)}`);
    } finally {
      setIsActing(false);
    }
  }, [playback]);

  const handleChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatMessage.trim();
    if (message.length === 0) return;

    setIsActing(true);
    playback.setError(null);
    setChatReply(null);
    setUserChatHistory((prev) => [...prev.slice(-4), message]);
    try {
      const reply = await sendChat(message);
      setChatReply(reply);
      if (reply.message) {
        setAgentMessages((prev) => [...prev.slice(-19), { role: "agent", text: reply.message, trackId: track?.id ?? "" }]);
      }
      setChatMessage("");

      // Execute action if returned
      if (reply.action?.type === "next-track") {
        const nowRes = await getNow();
        setNow(nowRes);
      } else if (reply.action?.type === "add-favorite" && reply.action.trackId) {
        setFavorites((prev) => {
          if (prev.some((f) => f.trackId === reply.action!.trackId)) return prev;
          return [...prev, {
            trackId: reply.action!.trackId!,
            title: reply.action!.title ?? "",
            artist: reply.action!.artist ?? "",
            favoritedAt: new Date().toISOString()
          }];
        });
      }
    } catch (chatError) {
      playback.setError(`发送失败：${getErrorMessage(chatError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (track === null) return;
    setIsActing(true);
    try {
      if (isFavorited) {
        await removeFavorite(track.id);
        setFavorites((prev) => prev.filter((f) => f.trackId !== track.id));
      } else {
        const favPayload: { trackId: string; title: string; artist: string; album?: string } = { trackId: track.id, title: track.title, artist: track.artist };
        if (track.album !== undefined) favPayload.album = track.album;
        const { favorite } = await addFavorite(favPayload);
        setFavorites((prev) => [...prev, { ...favorite, title: track.title, artist: track.artist, album: track.album }]);
      }
    } catch (favError) {
      playback.setError(`收藏操作失败：${getErrorMessage(favError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handlePlayPause = useCallback(async () => {
    if (playback.episodeState === "idle" || playback.episodeState === "error") {
      try {
        await playback.playEpisode();
        setIsPlaying(true);
      } catch {
        // playEpisode 内部已处理错误
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
  }, [playback.episodeState, playback.playEpisode, audio.musicRef]);

  const handleThemeChange = useCallback((newTheme: "terminal-fm" | "morning-console") => {
    setTheme(newTheme);
  }, []);

  const handleReplay = useCallback(() => {
    const speechAudio = audio.speechRef.current;
    if (speechAudio && speechAudio.src) {
      speechAudio.currentTime = 0;
      speechAudio.play().catch(() => {});
    }
  }, [audio.speechRef]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    localStorage.setItem("fakeradio-volume", String(newVolume));
    const musicAudio = audio.musicRef.current;
    if (musicAudio) {
      musicAudio.volume = newVolume;
    }
  }, [audio.musicRef]);

  return (
    <>
      <OnAirTerminal
        theme={theme}
        clock={onAirClock}
        modeLabel={onAirModeLabel}
        connectionLabel={onAirConnectionLabel}
        currentTrackTitle={currentTrackTitle}
        currentTrackArtist={currentTrackArtist}
        playbackLabel={currentPlaybackLabel}
        progressLabel={`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, "0")}`}
        durationLabel={durationMs > 0 ? formatDuration(durationMs) : "--:--"}
        djName="Claudio"
        djMessage={playback.error ?? (shouldWarn ? "当前音乐来源已回退到 mock，本地真实 provider 暂不可用。" : djMessage)}
        connectionDescription={connectionDescription}
        nowPlayingLabel={nowPlayingLabel}
        chatMessage={chatMessage}
        isActing={isActing || isLoading}
        isFavorited={isFavorited}
        isPlaying={isPlaying}
        progress={progress}
        queueCountLabel={queueCountLabel}
        prewarmStatus={prewarmStatus}
        agentMessages={agentMessages}
        userMessages={userChatHistory}
        episodeSource={playback.episodeSource}
        volume={volume}
        onPlay={playback.playEpisode}
        onPlayPause={handlePlayPause}
        onPrevious={() => {}}
        onNext={handleNext}
        onVolumeChange={handleVolumeChange}
        onToggleFavorite={handleToggleFavorite}
        onThemeChange={handleThemeChange}
        onReplay={handleReplay}
        onChatMessageChange={setChatMessage}
        onSubmitChat={handleChat}
      />
      <audio
        ref={audio.musicRef}
        className="audio-control-hidden"
        controls={false}
        preload="none"
        src={buildMediaUrl(playback.episodeData?.track.audioUrl ?? track?.audioUrl)}
      />
      <audio ref={audio.speechRef} preload="auto" style={{ display: "none" }} />
    </>
  );
}
