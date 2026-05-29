"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { NowResponse } from "@fakeradio/shared";
import { buildMediaUrl, getNow, getHealth } from "../../lib/api-client";
import {
  buildOnAirClock,
  getConnectionLabel,
  getDjMessageText,
  getOnAirModeLabel,
  getPlaybackLabel,
  getQueueCountLabel,
  shouldWarnOnMockMusic,
} from "./player-view-model";
import { useAudioEngine } from "./use-audio-engine";
import { usePlaybackState } from "./use-playback-state";
import { useStreamConnection } from "./use-stream-connection";
import { usePlayerPrefs } from "./use-player-prefs";
import { useProductionState } from "./use-production-state";
import { usePlayerControls } from "./use-player-controls";
import { SkinStage } from "./skin-stage";
import "./skins.css";

function buildClaudioIntro(trackTitle: string, artist: string, hour: number) {
  const daypart =
    hour >= 21 || hour < 7
      ? "late tonight"
      : hour < 12
        ? "this morning"
        : hour < 18
          ? "this afternoon"
          : "this evening";
  return `This is Claudio. ${daypart}, here is ${trackTitle} from ${artist}. Let the first line settle in, then let the song take the room. If the day has been loud, keep only the pulse you need.`;
}

export function PlayerShell() {
  // ---- hooks ----
  const audio = useAudioEngine();
  const playback = usePlaybackState(audio);
  const prefs = usePlayerPrefs();
  const production = useProductionState();
  const controls = usePlayerControls(audio, playback);

  const {
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
    favorites,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    chatMessage,
    agentMessages,
    setAgentMessages,
    pollIntervalRef,
    loadDashboard,
    handleNext,
    handlePlayPause,
    handleReplay,
    handleSeek,
    handleVolumeChange,
    submitChatMessage,
    handleChat,
    handleToggleFavorite,
  } = controls;

  const {
    theme,
    handleThemeChange,
    selectedPersona,
    handlePersonaChange,
    avatarSrc,
    handleAvatarUpload,
    handleAvatarRemove,
    showSettings,
    handleAvatarClick,
    volume,
    setVolume,
  } = prefs;

  const {
    productionBriefs,
    activeBriefId,
    productionPlans,
    productionJobs,
    productionProjects,
    generationLogs,
    activeBrief,
    activePlan,
    activeJob,
    loadProductionData,
    handleSwitchBrief,
    handlePauseJob,
    handleResumeJob,
    handleCancelJob,
    handleAddConstraint,
    handleProjectsChanged,
  } = production;

  // ---- stream connection ----
  const { streamStatus } = useStreamConnection(
    audio,
    useCallback((payload: NowResponse) => setNow(payload), [setNow]),
    useCallback(
      (queue: NowResponse["queue"]) => {
        setNow((current) => (current === null ? current : { ...current, queue }));
      },
      [setNow],
    ),
    useCallback(
      (dj: NowResponse["dj"]) => {
        setNow((current) => (current === null ? current : { ...current, dj }));
      },
      [setNow],
    ),
    useCallback(
      (msg: import("./use-stream-connection").AgentMessage) => {
        setAgentMessages((prev) => [...prev.slice(-19), msg]);
      },
      [setAgentMessages],
    ),
  );

  // ---- combined dashboard load ----
  const handleLoadDashboard = useCallback(async () => {
    await Promise.all([loadDashboard(), production.loadProductionData()]);
  }, [loadDashboard, production]);

  useEffect(() => {
    void handleLoadDashboard();
  }, [handleLoadDashboard]);

  // Initialize audio volume from saved setting
  useEffect(() => {
    const musicAudio = audio.musicRef.current;
    if (musicAudio) {
      musicAudio.volume = volume;
    }
  }, [audio.musicRef, volume]);

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
  }, [streamStatus.label, pollIntervalRef, setNow, setHealth]);

  // ---- derived values ----
  const shouldWarn = shouldWarnOnMockMusic(musicStatus);
  const playbackLabel = useMemo(() => getPlaybackLabel(now?.playback ?? "idle"), [now?.playback]);
  const onAirClock = useMemo(() => buildOnAirClock(nowDate), [nowDate]);
  const onAirModeLabel = useMemo(() => getOnAirModeLabel(nowDate.getHours()), [nowDate]);
  const connectionState: "connected" | "connecting" | "disconnected" =
    health !== null
      ? "connected"
      : streamStatus.label === "连接中"
        ? "connecting"
        : "disconnected";
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
  const realDjMessageSource = playback.episodeData?.story.text ?? now?.dj.say ?? null;
  const skinDjMessage = realDjMessageSource ? getDjMessageText(realDjMessageSource) : null;
  const djMessage = getDjMessageText(
    realDjMessageSource ?? buildClaudioIntro(currentTrackTitle, currentTrackArtist, nowDate.getHours()),
  );
  const queueCountLabel = getQueueCountLabel(now?.queue?.length ?? 0);
  const nowPlayingLabel = `Now playing: ${currentTrackTitle} · ${currentTrackArtist}`;
  const durationMs = playback.episodeData?.track.durationMs ?? track?.durationMs ?? 0;
  const progress = durationMs > 0 ? currentTime / (durationMs / 1000) : 0;
  const mood = onAirModeLabel;

  // ---- wrapped callbacks that sync volume ----
  const handleVolumeChangeWithSync = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      localStorage.setItem("fakeradio-volume", String(newVolume));
      handleVolumeChange(newVolume);
    },
    [setVolume, handleVolumeChange],
  );

  return (
    <>
      <SkinStage
        theme={theme}
        now={now}
        track={track}
        currentTrackTitle={currentTrackTitle}
        currentTrackArtist={currentTrackArtist}
        isPlaying={isPlaying}
        isLoadingEpisode={playback.isLoadingEpisode}
        currentTime={currentTime}
        durationMs={durationMs}
        volume={volume}
        favorites={favorites}
        mood={mood}
        selectedPersona={selectedPersona}
        avatarSrc={avatarSrc}
        error={playback.error}
        djMessage={skinDjMessage}
        agentMessages={agentMessages}
        onAgentMessage={(msg) => setAgentMessages((prev) => [...prev.slice(-19), msg])}
        onChatSubmit={submitChatMessage}
        onThemeChange={handleThemeChange}
        onAvatarClick={handleAvatarClick}
        onAvatarUpload={handleAvatarUpload}
        onAvatarRemove={handleAvatarRemove}
        onPersonaChange={handlePersonaChange}
        onPlayPause={handlePlayPause}
        onVolumeChange={handleVolumeChangeWithSync}
        onSeek={handleSeek}
        onToggleFavorite={handleToggleFavorite}
        onNext={handleNext}
        productionBriefs={productionBriefs}
        activeBriefId={activeBriefId}
        productionPlans={productionPlans}
        productionJobs={productionJobs}
        productionProjects={productionProjects}
        generationLogs={generationLogs}
        activeBrief={activeBrief}
        activePlan={activePlan}
        activeJob={activeJob}
        onSwitchBrief={handleSwitchBrief}
        onPauseJob={handlePauseJob}
        onResumeJob={handleResumeJob}
        onCancelJob={handleCancelJob}
        onAddConstraint={handleAddConstraint}
        onProjectsChanged={handleProjectsChanged}
        showSettings={showSettings}
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
