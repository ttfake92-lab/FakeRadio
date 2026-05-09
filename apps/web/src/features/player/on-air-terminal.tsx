"use client";

import type { FormEvent } from "react";
import type { OnAirClock, OnAirThemeId } from "./player-view-model";

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
  queueCountLabel: string;
  djName: string;
  djMessage: string;
  messageTimeLabel: string;
  nowPlayingLabel: string;
  chatMessage: string;
  isActing: boolean;
  isFavorited: boolean;
  onPlay(): void;
  onNext(): void;
  onToggleFavorite(): void;
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
  queueCountLabel,
  djName,
  djMessage,
  messageTimeLabel,
  nowPlayingLabel,
  chatMessage,
  isActing,
  isFavorited,
  onPlay,
  onNext,
  onToggleFavorite,
  onChatMessageChange,
  onSubmitChat
}: OnAirTerminalProps) {
  return (
    <main className={`on-air-stage theme-${theme}`} aria-label="FakeRadio On Air">
      <section className="on-air-panel" aria-labelledby="on-air-title">
        <header className="on-air-topbar">
          <div className="on-air-brand-lockup">
            <span className="on-air-avatar" aria-hidden="true" />
            <a id="on-air-title" className="on-air-brand" href="/">FakeRadio</a>
          </div>
          <nav className="on-air-top-actions" aria-label="FakeRadio status actions">
            <a href="/settings">LOGIN</a>
            <button type="button" aria-pressed={theme === "terminal-fm"}>DARK</button>
            <button type="button" aria-pressed={theme === "morning-console"}>LIGHT</button>
          </nav>
        </header>

        <section className="on-air-clock" aria-label="On Air status">
          <span className="on-air-clock-marker" aria-hidden="true">I</span>
          <p className="on-air-time">{clock.time}</p>
          <p className="on-air-weekday">{clock.weekday}</p>
          <p className="on-air-date">{clock.date}</p>
          <p className="on-air-live"><span aria-hidden="true">●</span> ON AIR · {modeLabel}</p>
        </section>

        <section className="on-air-play-strip" aria-label="Now playing">
          <div className="on-air-track-meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="on-air-track-copy">
            <p>{currentTrackTitle} · {currentTrackArtist}</p>
            <small>{playbackLabel}</small>
          </div>
          <div className="on-air-controls" aria-label="Playback controls">
            <button type="button" onClick={onNext} disabled={isActing} aria-label="上一段">◀</button>
            <button type="button" onClick={onPlay} disabled={isActing} aria-label="播放或暂停">Ⅱ</button>
            <button type="button" onClick={onNext} disabled={isActing} aria-label="下一段">▶</button>
            <button type="button" onClick={onToggleFavorite} disabled={isActing} aria-label={isFavorited ? "取消收藏" : "收藏"}>
              {isFavorited ? "♥" : "♡"}
            </button>
          </div>
          <div className="on-air-progress">
            <span>{progressLabel}</span>
            <div aria-hidden="true"><span /></div>
            <span>{durationLabel}</span>
          </div>
        </section>

        <section className="on-air-queue-strip" aria-label="Queue summary">
          <span>QUEUE</span>
          <span>{queueCountLabel}</span>
        </section>

        <section className="on-air-dj-room" aria-label="AI DJ live room">
          <header>
            <p><span aria-hidden="true">●</span> {djName}</p>
            <span>LIVE</span>
          </header>
          <p className="on-air-server-line">Connected to FakeRadio server</p>
          <article className="on-air-message">
            <span className="on-air-message-avatar" aria-hidden="true" />
            <div>
              <p className="on-air-message-author">{djName.toUpperCase()}</p>
              <div className="on-air-message-bubble">{djMessage}</div>
              <p className="on-air-message-meta">{messageTimeLabel} <button type="button">▶ REPLAY</button></p>
              <p className="on-air-now-playing">{nowPlayingLabel}</p>
            </div>
          </article>
        </section>

        <form className="on-air-input-bar" onSubmit={onSubmitChat}>
          <label className="sr-only" htmlFor="on-air-chat">Tell the DJ</label>
          <textarea
            id="on-air-chat"
            value={chatMessage}
            onChange={(event) => onChatMessageChange(event.target.value)}
            placeholder="Say something to the DJ..."
            rows={1}
          />
          <button type="button" aria-label="Voice input">◉</button>
          <button type="submit" disabled={isActing || chatMessage.trim().length === 0} aria-label="Send to DJ">↑</button>
        </form>

        <footer className="on-air-footer">
          <span>FAKERADIO FM</span>
          <span>{connectionLabel}</span>
        </footer>
      </section>
    </main>
  );
}
