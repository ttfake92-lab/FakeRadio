"use client";

import { useMemo } from "react";
import type { NowResponse, ProductionLog, ProgramBrief, ShowJob, ShowPlan, ShowProject, Track } from "@fakeradio/shared";
import type { OnAirThemeId } from "./player-view-model";
import type { FavoriteTrack } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import type { ShowPlanBlockConstraints } from "../../lib/api-client";
import { useRadioBridge } from "./use-radio-bridge";
import { SkinAmber } from "./skin-amber";
import type { Persona } from "./skin-config";
import { ProductionShell } from "../show/production-shell";

export type SkinStageProps = {
  theme: OnAirThemeId;
  now: NowResponse | null;
  track: Track | null;
  currentTrackTitle: string;
  currentTrackArtist: string;
  isPlaying: boolean;
  isLoadingEpisode: boolean;
  currentTime: number;
  durationMs: number;
  volume: number;
  favorites: FavoriteTrack[];
  mood: string;
  selectedPersona: Persona;
  avatarSrc: string | null;
  error?: string | null;
  djMessage?: string | null;
  agentMessages: AgentMessage[];
  onAgentMessage: (msg: AgentMessage) => void;
  onChatSubmit: (text: string) => void;
  onThemeChange: (theme: OnAirThemeId) => void;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
  onPersonaChange: (persona: Persona) => void;
  onPlayPause: () => void;
  onVolumeChange: (vol: number) => void;
  onSeek: (pos01: number) => void;
  onToggleFavorite: () => void;
  onNext: () => void;
  productionBriefs: ProgramBrief[];
  activeBriefId: string | null;
  productionPlans: ShowPlan[];
  productionJobs: ShowJob[];
  productionProjects: ShowProject[];
  generationLogs: ProductionLog[];
  activeBrief: ProgramBrief | null;
  activePlan: ShowPlan | null;
  activeJob: ShowJob | null;
  isGenerating?: boolean;
  onSwitchBrief?: (briefId: string) => void | Promise<void> | undefined;
  onPauseJob?: () => void;
  onResumeJob?: () => void;
  onCancelJob?: () => void;
  onAddConstraint?: (constraints: ShowPlanBlockConstraints) => void;
  onProjectsChanged?: () => void;
  showSettings?: boolean;
};

function generateTone(id: string): [string, string, string] {
  const hue = (id.charCodeAt(0) * 37 + id.charCodeAt(1) * 17) % 360;
  const hue2 = (hue + 40) % 360;
  const hue3 = (hue + 180) % 360;
  return [
    `hsl(${hue}, 60%, 20%)`,
    `hsl(${hue2}, 70%, 50%)`,
    `hsl(${hue3}, 80%, 70%)`,
  ];
}

function toVisualDuration(durationMs: number | undefined, currentTime: number) {
  if (durationMs === undefined || durationMs <= 0) return 0;
  return Math.max(1, Math.ceil(durationMs / 1000), Math.ceil(currentTime) + 1);
}

export function SkinStage({
  theme,
  now,
  track,
  currentTrackTitle,
  currentTrackArtist,
  isPlaying,
  isLoadingEpisode,
  currentTime,
  durationMs,
  volume,
  favorites,
  mood,
  selectedPersona,
  avatarSrc,
  error,
  djMessage,
  agentMessages,
  onChatSubmit,
  onThemeChange,
  onAvatarClick,
  onAvatarUpload,
  onAvatarRemove,
  onPersonaChange,
  onPlayPause,
  onVolumeChange,
  onSeek,
  onToggleFavorite,
  onNext,
  productionBriefs,
  activeBriefId,
  productionPlans,
  productionJobs,
  productionProjects,
  generationLogs,
  activeBrief,
  activePlan,
  activeJob,
  isGenerating,
  onSwitchBrief,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onAddConstraint,
  onProjectsChanged,
  showSettings = false,
}: SkinStageProps) {
  const liked = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const f of favorites) map[f.trackId] = true;
    return map;
  }, [favorites]);

  const visualTrack = useMemo(() => {
    if (!track) {
      return {
        id: "idle",
        title: currentTrackTitle,
        artist: currentTrackArtist,
        album: "FakeRadio",
        dur: toVisualDuration(durationMs, currentTime),
        source: "local" as const,
        tone: generateTone("idle"),
      };
    }
    return {
      id: track.id,
      title: currentTrackTitle,
      artist: currentTrackArtist,
      album: track.album ?? "",
      dur: toVisualDuration(track.durationMs ?? durationMs, currentTime),
      source: track.source as "netease" | "mock" | "local",
      tone: generateTone(track.id),
    };
  }, [currentTime, currentTrackArtist, currentTrackTitle, durationMs, track]);

  const visualNext = useMemo(() => {
    const nextTrack = now?.queue?.[0];
    if (!nextTrack) return visualTrack;
    return {
      id: nextTrack.id,
      title: nextTrack.title,
      artist: nextTrack.artist,
      album: nextTrack.album ?? "",
      dur: toVisualDuration(nextTrack.durationMs, 0),
      source: nextTrack.source as "netease" | "mock" | "local",
      tone: generateTone(nextTrack.id),
    };
  }, [now, visualTrack]);

  const chatMessages: import("./use-chat-sse").ChatMessage[] = useMemo(
    () =>
      agentMessages.map((m, i) => ({
        id: `agent-${i}`,
        role: "assistant" as const,
        text: m.text,
        fav: false,
      })),
    [agentMessages],
  );

  const seedTrackChip = useMemo(
    () => ({ title: visualTrack.title, artist: visualTrack.artist }),
    [visualTrack.artist, visualTrack.title],
  );

  const bridge = useRadioBridge({
    persona: selectedPersona,
    track: visualTrack,
    next: visualNext,
    seedMessage: djMessage,
    seedTrackChip,
    playing: isPlaying,
    loading: isLoadingEpisode,
    pos: currentTime,
    vol: volume,
    liked,
    mood,
    messages: chatMessages,
    input: "",
    busy: false,
    onSend: (text: string) => {
      onChatSubmit(text);
    },
    onChip: (prompt: string) => {
      onChatSubmit(prompt);
    },
    onToggleLike: onToggleFavorite,
    onSeek,
    onSkip: (dir: number) => {
      if (dir > 0) onNext();
    },
    onTogglePlay: onPlayPause,
    onVolumeChange: onVolumeChange,
    onNext,
  });

  return (
    <>
      <SkinAmber
        r={bridge.r}
        persona={selectedPersona}
        avatarSrc={avatarSrc}
        onAvatarClick={onAvatarClick}
        onAvatarUpload={onAvatarUpload}
        onAvatarRemove={onAvatarRemove}
      />
      <ProductionShell
        productionBriefs={productionBriefs}
        activeBriefId={activeBriefId}
        productionPlans={productionPlans}
        productionJobs={productionJobs}
        productionProjects={productionProjects}
        generationLogs={generationLogs}
        activeBrief={activeBrief}
        activePlan={activePlan}
        activeJob={activeJob}
        isGenerating={isGenerating ?? false}
        onSwitchBrief={onSwitchBrief}
        onPauseJob={onPauseJob}
        onResumeJob={onResumeJob}
        onCancelJob={onCancelJob}
        onAddConstraint={onAddConstraint}
        onProjectsChanged={onProjectsChanged}
        error={error}
        theme={theme}
        selectedPersona={selectedPersona}
        avatarSrc={avatarSrc}
        showSettings={showSettings}
        onThemeChange={onThemeChange}
        onPersonaChange={onPersonaChange}
        onAvatarUpload={onAvatarUpload}
        onAvatarRemove={onAvatarRemove}
        onAvatarClick={onAvatarClick}
      />
    </>
  );
}
