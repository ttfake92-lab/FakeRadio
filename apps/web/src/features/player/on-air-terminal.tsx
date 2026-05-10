"use client";

import type { FormEvent } from "react";
import type { OnAirClock, OnAirThemeId } from "./player-view-model";
import type { AgentMessage } from "./use-stream-connection";
import type { PrewarmStatus } from "@fakeradio/shared";
import { useState, useRef, useEffect } from "react";

export type OnAirTerminalProps = {
  theme: OnAirThemeId;
  clock: OnAirClock;
  modeLabel: string;
  connectionLabel: string;
  currentTrackTitle: string;
  currentTrackArtist: string;
  playbackLabel: string;
  progressLabel: string;
  durationLabel: string;
  djName: string;
  djMessage: string;
  connectionDescription: string;
  nowPlayingLabel: string;
  chatMessage: string;
  isActing: boolean;
  isFavorited: boolean;
  isPlaying: boolean;
  progress: number;
  volume: number;
  queueCountLabel: string;
  prewarmStatus: PrewarmStatus | null;
  agentMessages: AgentMessage[];
  userMessages: string[];
  episodeSource: "prepared" | "live" | null;
  onPlay(): void;
  onPlayPause(): void;
  onPrevious(): void;
  onNext(): void;
  onToggleFavorite(): void;
  onThemeChange(theme: OnAirThemeId): void;
  onVolumeChange(volume: number): void;
  onReplay(): void;
  onChatMessageChange(value: string): void;
  onSubmitChat(event: FormEvent<HTMLFormElement>): void;
};

export function OnAirTerminal({
  theme,
  clock,
  modeLabel,
  connectionLabel,
  currentTrackTitle,
  currentTrackArtist,
  playbackLabel,
  progressLabel,
  durationLabel,
  djName,
  djMessage,
  connectionDescription,
  nowPlayingLabel,
  chatMessage,
  isActing,
  isFavorited,
  isPlaying,
  progress,
  volume,
  queueCountLabel,
  prewarmStatus,
  agentMessages,
  userMessages,
  episodeSource,
  onPlay,
  onPlayPause,
  onPrevious,
  onNext,
  onToggleFavorite,
  onThemeChange,
  onVolumeChange,
  onReplay,
  onChatMessageChange,
  onSubmitChat
}: OnAirTerminalProps) {
  const [showDjPopover, setShowDjPopover] = useState(false);
  const [mounted, setMounted] = useState(false);
  const djPopoverRef = useRef<HTMLDivElement | null>(null);
  const djTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (djPopoverRef.current && !djPopoverRef.current.contains(event.target as Node)) {
        setShowDjPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDjBubbleClick = () => {
    setShowDjPopover(true);
    if (djTimeoutRef.current) clearTimeout(djTimeoutRef.current);
    djTimeoutRef.current = setTimeout(() => setShowDjPopover(false), 3000);
  };

  return (
    <main className={`on-air-stage theme-${theme}`} aria-label="FakeRadio On Air">
      <section className="on-air-panel" aria-labelledby="on-air-title">
        {/* ── Topbar ── */}
        <header className="on-air-topbar">
          <div className="on-air-brand-lockup">
            <span className="on-air-avatar on-air-photo-avatar" aria-hidden="true" />
            <a id="on-air-title" className="on-air-brand" href="/">Claudio</a>
          </div>
          <nav className="on-air-top-actions" aria-label="Claudio status actions">
            {prewarmStatus && (
              <span
                className="on-air-prewarm-badge"
                title={`${prewarmStatus.enabled ? "ON" : "OFF"} · ${prewarmStatus.blocks.reduce((s, b) => s + b.ready, 0)} ready`}
              >
                <span aria-hidden="true" className={`on-air-prewarm-dot ${prewarmStatus.enabled ? "is-on" : ""}`} />
                {prewarmStatus.enabled ? "ON" : "OFF"}
              </span>
            )}
            <a href="/settings" className="on-air-capsule">LOGIN</a>
            <button
              type="button"
              className="on-air-capsule"
              onClick={() => onThemeChange("terminal-fm")}
              aria-pressed={theme === "terminal-fm"}
            >
              DARK
            </button>
            <button
              type="button"
              className="on-air-capsule"
              onClick={() => onThemeChange("morning-console")}
              aria-pressed={theme === "morning-console"}
            >
              LIGHT
            </button>
          </nav>
        </header>

        {/* ── Clock ── */}
        <section className="on-air-clock" aria-label="On Air status">
          <p className="on-air-time">{mounted ? clock.time : "--:--"}</p>
          <p className="on-air-weekday">{mounted ? clock.weekday : "---"}</p>
          <p className="on-air-date">{mounted ? clock.date : "-- --- ----"}</p>
          <p className="on-air-live"><span aria-hidden="true">●</span> ON AIR · {modeLabel}</p>
        </section>

        {/* ── Play Strip ── */}
        <section className="on-air-play-strip" aria-label="Now playing">
          <div className="on-air-play-left">
            <div className={`on-air-track-meter ${isPlaying ? "is-rhythming" : ""}`} aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <div className="on-air-track-copy">
              <p>{currentTrackTitle}</p>
              <small>{currentTrackArtist}</small>
              <span className="on-air-playback-status">
                {episodeSource === "prepared" && <span className="episode-source-badge prepared">已就绪</span>}
                {playbackLabel}
              </span>
            </div>
          </div>
          <div className="on-air-controls" aria-label="Playback controls">
            <button type="button" onClick={onPrevious} disabled={isActing} aria-label="上一首">◀◀</button>
            <button type="button" onClick={onPlayPause} disabled={isActing} aria-label={isPlaying ? "暂停" : "播放"}>
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button type="button" onClick={onNext} disabled={isActing} aria-label="下一首">▶▶</button>
            <button type="button" onClick={onToggleFavorite} disabled={isActing || !currentTrackTitle} aria-label={isFavorited ? "取消收藏" : "收藏"}>
              {isFavorited ? "♥" : "♡"}
            </button>
          </div>
          <div className="on-air-volume">
            <button
              type="button"
              className="on-air-volume-label"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
              aria-label={volume > 0 ? "静音" : "取消静音"}
            >
              VOL
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              suppressHydrationWarning
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="音量"
            />
          </div>
          <div className="on-air-progress">
            <span>{progressLabel}</span>
            <div aria-hidden="true"><span style={{ width: `${Math.min(progress * 100, 100)}%` }} /></div>
            <span>{durationLabel}</span>
          </div>
        </section>

        {/* ── Queue Strip ── */}
        <section className="on-air-queue-strip" aria-label="Queue">
          <span>QUEUE</span>
          <span>{queueCountLabel}</span>
        </section>

        {/* ── DJ Room ── */}
        <section className="on-air-dj-room" aria-label="AI DJ live room">
          <header>
            <div className="on-air-dj-room-header-left">
              <span className="on-air-dj-avatar on-air-photo-avatar" aria-hidden="true" />
              <span className="on-air-dj-name">{djName}</span>
            </div>
            <div className="on-air-dj-room-header-right">
              <span className="on-air-live-badge" aria-hidden="true">●</span>
              <span className="on-air-live-text">LIVE</span>
            </div>
          </header>
          <p className="on-air-connection-line">{connectionDescription}</p>
          <article className="on-air-message">
            <div className="on-air-message-bubble" onClick={handleDjBubbleClick} ref={djPopoverRef}>
              {agentMessages.length === 0 && userMessages.length === 0 ? (
                djMessage
              ) : (
                <div className="on-air-message-list">
                  {agentMessages.slice(-1).map((msg) => (
                    <p key={`a-${msg.text}`} className="on-air-msg-agent">{msg.text}</p>
                  ))}
                  {userMessages.slice(-1).map((msg) => (
                    <p key={`u-${msg}`} className="on-air-msg-user">{msg}</p>
                  ))}
                </div>
              )}
              {showDjPopover && (
                <div className="on-air-glass-popover dj-popover">
                  <button type="button" onClick={onReplay}>↻ Replay</button>
                  <button type="button" onClick={() => { setShowDjPopover(false); }}>+ Add to Radio</button>
                </div>
              )}
            </div>
            <button type="button" className="on-air-replay-btn" onClick={onReplay} aria-label="Replay">
              ↻ Replay
            </button>
          </article>
          <p className="on-air-now-playing">{nowPlayingLabel}</p>
        </section>

        {/* ── Input Bar ── */}
        <form className="on-air-input-bar" onSubmit={onSubmitChat}>
          <label className="sr-only" htmlFor="on-air-chat">Say something to the DJ</label>
          <textarea
            id="on-air-chat"
            value={chatMessage}
            onChange={(event) => onChatMessageChange(event.target.value)}
            placeholder="Say something to the DJ..."
            rows={1}
            suppressHydrationWarning
          />
          <button type="button" className="on-air-mic-btn" aria-label="Voice input" title="语音输入即将支持">◉</button>
          <button type="submit" className="on-air-send-btn" disabled={isActing || chatMessage.trim().length === 0} aria-label="Send to DJ">↑</button>
        </form>

        {/* ── Footer ── */}
        <footer className="on-air-footer">
          <span>CLAUDIO FM</span>
          <span>{connectionLabel}.</span>
        </footer>
      </section>
    </main>
  );
}
