"use client";

import { useCallback, useMemo } from "react";
import type { NowResponse, Track } from "@fakeradio/shared";
import type { OnAirThemeId } from "./player-view-model";
import type { FavoriteTrack } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import { useRadioBridge } from "./use-radio-bridge";
import { SkinAmber } from "./skin-amber";
import { SkinPixel } from "./skin-pixel";
import { SkinTerminal } from "./skin-terminal";
import { SkinBento } from "./skin-bento";
import { SkinY2K } from "./skin-y2k";
import { SKINS, PERSONAS, type Persona } from "./skin-config";

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
  showSettings: boolean;
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
  showSettings,
  error,
  djMessage,
  agentMessages,
  onAgentMessage,
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
    // Use currentTrackTitle/currentTrackArtist for display to respect episodeData.track
    // when an episode is playing. track.id is still used for tone generation.
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
    () => agentMessages.map((m, i) => ({
      id: `agent-${i}`,
      role: "assistant" as const,
      text: m.text,
      fav: false,
    })),
    [agentMessages]
  );

  const seedTrackChip = useMemo(
    () => ({ title: visualTrack.title, artist: visualTrack.artist }),
    [visualTrack.artist, visualTrack.title]
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
    onSend: (text: string) => { onChatSubmit(text); },
    onChip: (prompt: string) => { onChatSubmit(prompt); },
    onToggleLike: onToggleFavorite,
    onSeek,
    onSkip: (dir: number) => { if (dir > 0) onNext(); },
    onTogglePlay: onPlayPause,
    onVolumeChange: onVolumeChange,
    onNext,
  });

  const skinProps = {
    r: bridge.r,
    persona: selectedPersona,
    avatarSrc,
    onAvatarClick,
    onAvatarUpload,
    onAvatarRemove,
  };

  const renderSkin = () => {
    switch (theme) {
      case "amber": return <SkinAmber {...skinProps} />;
      case "pixel": return <SkinPixel {...skinProps} />;
      case "terminal": return <SkinTerminal {...skinProps} />;
      case "bento": return <SkinBento {...skinProps} />;
      case "y2k": return <SkinY2K {...skinProps} />;
      default: return <SkinAmber {...skinProps} />;
    }
  };

  return (
    <>
      {renderSkin()}
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            padding: "10px 16px",
            background: "rgba(200, 0, 0, 0.92)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 13,
            maxWidth: "80vw",
            textAlign: "center",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {error}
        </div>
      )}
      {showSettings && (
        <SettingsPanel
          theme={theme}
          selectedPersona={selectedPersona}
          avatarSrc={avatarSrc}
          onThemeChange={onThemeChange}
          onPersonaChange={onPersonaChange}
          onAvatarUpload={onAvatarUpload}
          onAvatarRemove={onAvatarRemove}
          onClose={() => onAvatarClick()}
        />
      )}
    </>
  );
}

function SettingsPanel({
  theme,
  selectedPersona,
  avatarSrc,
  onThemeChange,
  onPersonaChange,
  onAvatarUpload,
  onAvatarRemove,
  onClose,
}: {
  theme: OnAirThemeId;
  selectedPersona: Persona;
  avatarSrc: string | null;
  onThemeChange: (t: OnAirThemeId) => void;
  onPersonaChange: (p: Persona) => void;
  onAvatarUpload: (f: File) => void;
  onAvatarRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 24,
          width: 320,
          maxHeight: "80vh",
          overflowY: "auto",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Settings</h3>

        {/* Theme selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>THEME</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(SKINS).map(([id, s]) => (
              <button
                key={id}
                onClick={() => onThemeChange(id as OnAirThemeId)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: theme === id ? "2px solid #e8a04a" : "1px solid rgba(255,255,255,0.15)",
                  background: theme === id ? "rgba(232,160,74,0.15)" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Persona selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>DJ PERSONA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.values(PERSONAS) as Persona[]).map((p) => (
                <button
                  key={p.short}
                  onClick={() => onPersonaChange(p)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: selectedPersona.short === p.short ? "2px solid #e8a04a" : "1px solid rgba(255,255,255,0.1)",
                    background: selectedPersona.short === p.short ? "rgba(232,160,74,0.15)" : "rgba(255,255,255,0.05)",
                    color: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{p.short} · {p.tag.split(" · ")[1] ?? p.tag}</div>
                </button>
              ))}
          </div>
        </div>

        {/* Avatar */}
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>DJ AVATAR</div>
          {avatarSrc ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src={avatarSrc} alt="avatar" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
              <button
                onClick={onAvatarRemove}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12, cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          ) : (
            <label style={{ display: "block", padding: "12px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", cursor: "pointer" }}>
              Click to upload photo
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onAvatarUpload(f); }} />
            </label>
          )}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: 20, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#e8a04a", color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
