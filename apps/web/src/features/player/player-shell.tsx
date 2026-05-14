"use client";

import type { ChatResponse, FavoriteTrack, HealthResponse, NowResponse, PrewarmStatus, ProgramBrief, ShowPlan, ShowJob, ShowProject } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { addFavorite, buildMediaUrl, getFavorites, getHealth, getNow, getPrewarmStatus, removeFavorite, sendChat, getBriefs, getShowPlans, getShowJobs, getShowProjects, pauseJob, resumeJob, cancelJob, markJobNeedsReplan, addConstraintsToPlan, type ShowPlanBlockConstraints } from "../../lib/api-client";
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
import { useRadioBridge } from "./use-radio-bridge";
import { SkinAmber } from "./skin-amber";
import { SkinPixel } from "./skin-pixel";
import { SkinTerminal } from "./skin-terminal";
import { SkinBento } from "./skin-bento";
import { SkinY2K } from "./skin-y2k";
import { SkinStage } from "./skin-stage";
import { ON_AIR_THEMES, type OnAirThemeId } from "./player-view-model";
import { PERSONAS, SKINS, type Persona } from "./skin-config";
import "./skins.css";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getMusicStatus(health: HealthResponse | null) {
  const status = health?.adapters.music;
  return typeof status === "string" ? status : "mock";
}

function buildClaudioIntro(trackTitle: string, artist: string, hour: number) {
  const daypart = hour >= 21 || hour < 7 ? "late tonight" : hour < 12 ? "this morning" : hour < 18 ? "this afternoon" : "this evening";
  return `This is Claudio. ${daypart}, here is ${trackTitle} from ${artist}. Let the first line settle in, then let the song take the room. If the day has been loud, keep only the pulse you need.`;
}

export function PlayerShell() {
  const [now, setNow] = useState<NowResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [userChatHistory, setUserChatHistory] = useState<string[]>([]);
  const [nowDate, setNowDate] = useState(() => new Date());
  const [theme, setTheme] = useState<OnAirThemeId>("amber");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem("fakeradio-volume");
    return saved !== null ? Number(saved) : 1;
  });
  const [prewarmStatus, setPrewarmStatus] = useState<PrewarmStatus | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(Object.values(PERSONAS)[0]!);
  const [showSettings, setShowSettings] = useState(false);
  const [productionBriefs, setProductionBriefs] = useState<ProgramBrief[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [productionPlans, setProductionPlans] = useState<ShowPlan[]>([]);
  const [productionJobs, setProductionJobs] = useState<ShowJob[]>([]);
  const [productionProjects, setProductionProjects] = useState<ShowProject[]>([]);

  const activeBrief = productionBriefs.find((b) => b.id === activeBriefId) ?? productionBriefs[0] ?? null;
  const activePlan = useMemo(() => {
    if (!activeBrief) return null;
    return (
      productionPlans.find((p) => p.active && p.briefId === activeBrief.id) ??
      productionPlans.find((p) => p.briefId === activeBrief.id) ??
      null
    );
  }, [activeBrief, productionPlans]);

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

  const track = now?.track ?? playback.episodeData?.track ?? null;
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
  const realDjMessageSource = playback.episodeData?.story.text ?? now?.dj.say ?? chatReply?.message ?? null;
  const skinDjMessage = realDjMessageSource ? getDjMessageText(realDjMessageSource) : null;
  const djMessage = getDjMessageText(realDjMessageSource ?? buildClaudioIntro(currentTrackTitle, currentTrackArtist, nowDate.getHours()));
  const queueCountLabel = getQueueCountLabel(now?.queue?.length ?? 0);
  const nowPlayingLabel = `Now playing: ${currentTrackTitle} · ${currentTrackArtist}`;
  const durationMs = playback.episodeData?.track.durationMs ?? track?.durationMs ?? 0;
  const progress = durationMs > 0 ? currentTime / (durationMs / 1000) : 0;

  const isNewSkin = (t: OnAirThemeId): boolean =>
    t === "amber" || t === "pixel" || t === "terminal" || t === "bento" || t === "y2k";

  const mood = onAirModeLabel;

  // Find active job (first pending/running/paused/needs-replan job)
  const activeJob = useMemo(() => {
    if (!activeBrief) return null;
    const jobsForBrief = productionJobs.filter((j) => j.briefId === activeBrief.id);
    return (
      jobsForBrief.find((j) =>
        ["pending", "running", "paused", "needs-replan"].includes(j.status)
      ) ?? jobsForBrief[0] ?? null
    );
  }, [activeBrief, productionJobs]);

  const handlePauseJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await pauseJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job))
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleResumeJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await resumeJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job))
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleCancelJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await cancelJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job))
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleAddConstraint = useCallback(async (constraints: ShowPlanBlockConstraints) => {
    if (!activePlan) return;
    try {
      const response = await addConstraintsToPlan(activePlan.id, constraints);
      if (response.plan) {
        setProductionPlans((prev) => [...prev, response.plan]);
        if (activeJob) {
          await markJobNeedsReplan(activeJob.id, "用户追加新约束，触发重新规划");
        }
      }
    } catch {
      // Ignore errors for now
    }
  }, [activePlan, activeJob]);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, healthResponse, favoritesResponse, prewarmStatusResponse, briefsResponse, projectsResponse] = await Promise.all([
        getNow(), getHealth(), getFavorites(), getPrewarmStatus().catch(() => null),
        getBriefs().catch(() => ({ briefs: [] })),
        getShowProjects().catch(() => ({ projects: [] }))
      ]);
      setNow(nowResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
      setPrewarmStatus(prewarmStatusResponse);
      const briefs = briefsResponse.briefs ?? [];
      setProductionBriefs(briefs);
      setProductionProjects(projectsResponse.projects ?? []);

      // 确定 active brief
      let currentActiveBriefId = activeBriefId;
      if (briefs.length > 0) {
        if (!currentActiveBriefId || !briefs.find(b => b.id === currentActiveBriefId)) {
          const firstBrief = briefs[0];
          if (firstBrief) {
            currentActiveBriefId = firstBrief.id;
            setActiveBriefId(currentActiveBriefId);
          }
        }
      }

      // 按 active brief 获取 plans 和 jobs
      const [plansResponse, jobsResponse] = await Promise.all([
        currentActiveBriefId 
          ? getShowPlans(currentActiveBriefId).catch(() => ({ plans: [] })) 
          : getShowPlans().catch(() => ({ plans: [] })),
        currentActiveBriefId 
          ? getShowJobs(currentActiveBriefId).catch(() => ({ jobs: [] })) 
          : getShowJobs().catch(() => ({ jobs: [] }))
      ]);
      setProductionPlans(plansResponse.plans ?? []);
      setProductionJobs(jobsResponse.jobs ?? []);
      // Sync theme with time of day on load, while preserving any explicit skin choice.
      const hour = new Date().getHours();
      const savedTheme = localStorage.getItem("fakeradio-theme") as OnAirThemeId | null;
      if (savedTheme && ON_AIR_THEMES.includes(savedTheme)) {
        setTheme(savedTheme);
      } else {
        setTheme(hour >= 7 && hour < 9 ? "morning-console" : "amber");
      }
      // Load saved persona
      const savedPersonaId = localStorage.getItem("fakeradio-persona");
      if (savedPersonaId) {
        const found = Object.values(PERSONAS).find((p) => p.short === savedPersonaId);
        if (found) setSelectedPersona(found);
      }
      // Load saved avatar
      const savedAvatar = localStorage.getItem("fakeradio-avatar");
      if (savedAvatar) setAvatarSrc(savedAvatar);
    } catch (loadError) {
      playback.setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeBriefId]);

  const handleSwitchBrief = useCallback(async (briefId: string) => {
    setActiveBriefId(briefId);
    const [plansResponse, jobsResponse] = await Promise.all([
      getShowPlans(briefId).catch(() => ({ plans: [] })),
      getShowJobs(briefId).catch(() => ({ jobs: [] }))
    ]);
    setProductionPlans(plansResponse.plans ?? []);
    setProductionJobs(jobsResponse.jobs ?? []);
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

  const submitChatMessage = useCallback(async (rawMessage: string) => {
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
  }, [track]);

  const handleChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitChatMessage(chatMessage);
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

  const handleThemeChange = useCallback((newTheme: OnAirThemeId) => {
    setTheme(newTheme);
    localStorage.setItem("fakeradio-theme", newTheme);
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

  const handleSeek = useCallback((pos01: number) => {
    const musicAudio = audio.musicRef.current;
    if (musicAudio && musicAudio.duration) {
      musicAudio.currentTime = pos01 * musicAudio.duration;
      setCurrentTime(musicAudio.currentTime);
    }
  }, [audio.musicRef]);

  const handleAvatarClick = useCallback(() => {
    setShowSettings((s) => !s);
  }, []);

  const handleAvatarUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAvatarSrc(dataUrl);
      localStorage.setItem("fakeradio-avatar", dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAvatarRemove = useCallback(() => {
    setAvatarSrc(null);
    localStorage.removeItem("fakeradio-avatar");
  }, []);

  const handlePersonaChange = useCallback((persona: Persona) => {
    setSelectedPersona(persona);
    localStorage.setItem("fakeradio-persona", persona.short);
  }, []);

  return (
    <>
      {isNewSkin(theme) ? (
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
          showSettings={showSettings}
          error={playback.error}
          djMessage={skinDjMessage}
          agentMessages={agentMessages}
          onAgentMessage={(msg) => setAgentMessages((prev) => [...prev.slice(-19), msg])}
          onChatSubmit={(text) => { void submitChatMessage(text); }}
          onThemeChange={handleThemeChange}
          onAvatarClick={handleAvatarClick}
          onAvatarUpload={handleAvatarUpload}
          onAvatarRemove={handleAvatarRemove}
          onPersonaChange={handlePersonaChange}
          onPlayPause={handlePlayPause}
          onVolumeChange={handleVolumeChange}
          onSeek={handleSeek}
          onToggleFavorite={handleToggleFavorite}
          onNext={handleNext}
          productionBriefs={productionBriefs}
          activeBriefId={activeBriefId}
          productionPlans={productionPlans}
          productionJobs={productionJobs}
          productionProjects={productionProjects}
          onSwitchBrief={handleSwitchBrief}
          onPauseJob={handlePauseJob}
          onResumeJob={handleResumeJob}
          onCancelJob={handleCancelJob}
          onAddConstraint={handleAddConstraint}
        />
      ) : (
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
      )}
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
