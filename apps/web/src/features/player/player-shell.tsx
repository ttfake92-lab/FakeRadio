"use client";

import type { ChatResponse, FavoriteTrack, HealthResponse, NextResponse, NowResponse } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { addFavorite, buildMediaUrl, getFavorites, getHealth, getNext, getNow, removeFavorite, sendChat } from "../../lib/api-client";
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
  const [nowDate, setNowDate] = useState(() => new Date());
  const [theme, setTheme] = useState<"terminal-fm" | "morning-console">("terminal-fm");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

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
  const onAirConnectionLabel = getConnectionLabel(
    streamStatus.label === "已连接" ? "connected" : streamStatus.label === "连接中" ? "connecting" : "disconnected"
  );
  const currentTrackTitle = playback.episodeData?.track.title ?? track?.title ?? "Waiting for signal";
  const currentTrackArtist = playback.episodeData?.track.artist ?? track?.artist ?? "FakeRadio";
  const currentPlaybackLabel = playback.episodeState !== "idle" ? playback.episodeStateLabel : playbackLabel;
  const djMessage = getDjMessageText(now?.dj.say ?? playback.episodeData?.story.text ?? chatReply?.message);
  const queueCountLabel = getQueueCountLabel(now?.queue?.length ?? 0);
  const nowPlayingLabel = `Now playing: ${currentTrackTitle} · ${currentTrackArtist}`;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, healthResponse, favoritesResponse] = await Promise.all([
        getNow(), getHealth(), getFavorites()
      ]);
      setNow(nowResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
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

  const handleNext = async () => {
    setIsActing(true);
    playback.setError(null);
    try {
      const result = await getNext();
      setNextResult(result);
      setNow(buildNowFromNext(result));
    } catch (nextError) {
      playback.setError(`生成下一首失败：${getErrorMessage(nextError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatMessage.trim();
    if (message.length === 0) return;

    setIsActing(true);
    playback.setError(null);
    try {
      const reply = await sendChat(message);
      setChatReply(reply);
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

  const handlePlayPause = useCallback(() => {
    const musicAudio = audio.musicRef.current;
    if (!musicAudio) return;
    if (musicAudio.paused) {
      musicAudio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      musicAudio.pause();
      setIsPlaying(false);
    }
    setCurrentTime(musicAudio.currentTime);
  }, [audio.musicRef]);

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
        durationLabel={formatDuration(playback.episodeData?.track.durationMs ?? track?.durationMs)}
        queueCountLabel={queueCountLabel}
        djName="FakeRadio"
        djMessage={playback.error ?? (shouldWarn ? "当前音乐来源已回退到 mock，本地真实 provider 暂不可用。" : djMessage)}
        messageTimeLabel={onAirClock.time}
        nowPlayingLabel={nowPlayingLabel}
        chatMessage={chatMessage}
        isActing={isActing || isLoading}
        isFavorited={isFavorited}
        isPlaying={isPlaying}
        onPlay={playback.playEpisode}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
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
