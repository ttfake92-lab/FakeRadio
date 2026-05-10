"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";
import type { ChatMessage } from "./use-chat-sse";
import { getPlaybackControlText } from "./player-view-model";

export type SkinAmberProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

function CoverArt({
  track,
  playing,
}: {
  track: { id: string; tone: [string, string, string] };
  playing: boolean;
}) {
  const [a, b, c] = track.tone;
  return (
    <div className="fr-cover" aria-hidden>
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
      >
        <defs>
          <radialGradient id={`g-${track.id}`} cx="35%" cy="30%" r="90%">
            <stop offset="0%" stopColor={c} />
            <stop offset="55%" stopColor={b} />
            <stop offset="100%" stopColor={a} />
          </radialGradient>
          <filter id={`n-${track.id}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.4"
              numOctaves="2"
              seed={track.id.charCodeAt(1)}
            />
            <feColorMatrix
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.32 0"
            />
          </filter>
        </defs>
        <rect width="200" height="200" fill={`url(#g-${track.id})`} />
        {[88, 76, 64, 52, 40, 28].map((r, i) => (
          <circle
            key={i}
            cx="100"
            cy="108"
            r={r}
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="0.6"
          />
        ))}
        <circle
          cx="100"
          cy="108"
          r="14"
          fill={a}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.5"
        />
        <circle cx="100" cy="108" r="2.2" fill={c} />
        <rect
          width="200"
          height="200"
          filter={`url(#n-${track.id})`}
          opacity="0.55"
        />
      </svg>
      <div className={`fr-cover-spin ${playing ? "on" : ""}`} />
    </div>
  );
}

function WaveAvatar({
  active,
  size = 34,
}: {
  active?: boolean;
  size?: number;
}) {
  const bars = 5;
  return (
    <div
      className="fr-wave"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={active ? "on" : ""}
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

function Bubble({
  msg,
  onAction,
  avatarSrc,
  onAvatarClick,
}: {
  msg: ChatMessage;
  onAction: (kind: string, msg: ChatMessage) => void;
  avatarSrc: string | null;
  onAvatarClick: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    t.current = setTimeout(() => setMenu(true), 480);
  };
  const cancel = () => {
    if (t.current) clearTimeout(t.current);
  };
  const isUser = msg.role === "user";

  return (
    <div className={`fr-bubble-row ${isUser ? "u" : "a"}`}>
      {!isUser && (
        <button
          type="button"
          onClick={onAvatarClick}
          title="点击上传照片做 DJ 头像"
          style={{
            appearance: "none",
            border: 0,
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            borderRadius: "50%",
            display: "inline-flex",
          }}
        >
          {avatarSrc ? (
            <img className="fr-dj-avatar" src={avatarSrc} alt="dj" />
          ) : (
            <WaveAvatar active={!!msg.streaming} size={28} />
          )}
        </button>
      )}
      <div className="fr-bubble-wrap">
        <div
          className={`fr-bubble ${isUser ? "u" : "a"}${msg.fav ? " fav" : ""}`}
          onMouseDown={start}
          onMouseUp={cancel}
          onMouseLeave={cancel}
          onTouchStart={start}
          onTouchEnd={cancel}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(true);
          }}
        >
          {msg.text}
          {msg.streaming && <span className="fr-caret" />}
          {msg.trackChip && (
            <div className="fr-chip-track">
              <span className="fr-dot" /> 正在播 · {msg.trackChip.title} —{" "}
              {msg.trackChip.artist}
            </div>
          )}
          {msg.fav && <div className="fr-fav-mark">★ 已收藏</div>}
        </div>
        {menu && (
          <div className="fr-bub-menu" onMouseLeave={() => setMenu(false)}>
            <button
              onClick={() => {
                onAction("fav", msg);
                setMenu(false);
              }}
            >
              {msg.fav ? "取消收藏" : "收藏这条"}
            </button>
            <button
              onClick={() => {
                onAction("more", msg);
                setMenu(false);
              }}
            >
              多说点
            </button>
            <button
              onClick={() => {
                onAction("less", msg);
                setMenu(false);
              }}
            >
              太长了
            </button>
            <button
              onClick={() => {
                onAction("copy", msg);
                setMenu(false);
              }}
            >
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkinAmber({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinAmberProps) {
  const {
    track,
    playing,
    loading,
    pos,
    vol,
    liked,
    mood,
    togglePlay,
    skip,
    seek,
    toggleLike,
    messages,
    input,
    busy,
    setInput,
    send,
    onBubbleAction,
  } = r;

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!track) {
    return (
      <div className="fr-stage">
        <div className="fr-frame fr-frame-amber" data-screen-label="01 Amber">
          <section className="fr-player">
            <div className="fr-player-bg" aria-hidden>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg, #1a1210 0%, #2d1f1a 50%, #1a1210 100%)",
                }}
              />
              <div className="fr-player-veil" />
            </div>
            <div className="fr-player-fg">
              <div className="fr-player-top">
                <div className="fr-badge">
                  <span className="fr-led" /> FAKERADIO
                </div>
                <button
                  type="button"
                  onClick={onAvatarClick}
                  title="设置"
                  style={{
                    appearance: "none",
                    border: 0,
                    background: "transparent",
                    color: "rgba(243,227,199,0.6)",
                    fontSize: 16,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                >
                  ⚙
                </button>
              </div>
              <div
                className="fr-player-mid"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 48 }}>📻</div>
                <div
                  style={{
                    color: "rgba(243,227,199,0.6)",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  FakeRadio 已连接
                </div>
                <div style={{ color: "rgba(243,227,199,0.4)", fontSize: 12 }}>
                  点击播放开始
                </div>
              </div>
              <div className="fr-controls" style={{ justifyContent: "center" }}>
                <button
                  className="fr-ctl big"
                  onClick={togglePlay}
                  disabled={loading}
                  style={{ color: "#e8a04a" }}
                >
                  {getPlaybackControlText(loading, playing, "▶", "❚❚", "…")}
                </button>
              </div>
            </div>
          </section>
          <section className="fr-chat">
            <div className="fr-chat-tape">
              <span className="fr-tape-led" />
              <span className="fr-tape-mood">{mood}</span>
              <span className="fr-tape-status">待机</span>
            </div>
            <div
              className="fr-chat-body"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ color: "rgba(243,227,199,0.3)", fontSize: 12 }}>
                等待信号…
              </div>
            </div>
          </section>
          <div className="fr-frame-grain" aria-hidden />
          <div className="fr-frame-vignette" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className="fr-stage">
      <div className="fr-frame fr-frame-amber" data-screen-label="01 Amber">
        <section className="fr-player">
          <div className="fr-player-bg" aria-hidden>
            <CoverArt track={track} playing={playing} />
            <div className="fr-player-veil" />
            <div className="fr-player-grain" />
          </div>
          <div className="fr-player-fg">
            <div className="fr-player-top">
              <div className="fr-badge">
                <span className="fr-led" /> FAKERADIO
              </div>
            </div>
            <div className="fr-player-mid">
              <div className="fr-cover-mini">
                <CoverArt track={track} playing={playing} />
              </div>
              <div className="fr-meta">
                <div className="fr-title">{track.title}</div>
                <div className="fr-artist">
                  {track.artist} · {track.album}
                </div>
              </div>
            </div>
            <div
              className="fr-progress"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - rect.left) / rect.width);
              }}
            >
              <div className="fr-bar">
                <div
                  className="fr-fill"
                  style={{ width: `${track.dur > 0 ? (pos / track.dur) * 100 : 0}%` }}
                />
              </div>
              <div className="fr-times">
                <span>{fmt(pos)}</span>
                <span>{track.dur > 0 ? fmt(track.dur) : "--:--"}</span>
              </div>
            </div>
            <div className="fr-controls">
              <button
                className={`fr-ctl heart${liked[track.id] ? " on" : ""}`}
                onClick={toggleLike}
              >
                {liked[track.id] ? "♥" : "♡"}
              </button>
              <button className="fr-ctl" onClick={() => skip(-1)} disabled={loading}>
                ⏮
              </button>
              <button className="fr-ctl big" onClick={togglePlay} disabled={loading}>
                {getPlaybackControlText(loading, playing, "▶", "❚❚", "…")}
              </button>
              <button className="fr-ctl" onClick={() => skip(1)} disabled={loading}>
                ⏭
              </button>
              <div className="fr-vol">
                <span>♪</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vol}
                  onChange={(e) => r.setVol(parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="fr-chat">
          <div className="fr-chat-tape">
            <span className="fr-tape-led" />
            <span className="fr-tape-mood">
              {mood} · {persona.tag.split(" · ")[1]}
            </span>
            <span className="fr-tape-status">
              {loading ? "PREPARING…" : busy ? "SYNTHESIZING…" : "ON AIR"}
            </span>
          </div>
          <div className="fr-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <Bubble
                key={m.id}
                msg={m}
                onAction={onBubbleAction}
                avatarSrc={avatarSrc}
                onAvatarClick={onAvatarClick}
              />
            ))}
            {busy && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="fr-typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          <div className="fr-chips">
            {QUICK_PROMPTS.map((q, i) => (
              <button
                key={i}
                className="fr-chip"
                onClick={() => r.ask(q.prompt)}
                disabled={busy}
              >
                {q.label}
              </button>
            ))}
          </div>
          <form
            className="fr-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "DJ 正在说话…" : "对 DJ 说点什么"}
              disabled={busy}
            />
            <button
              type="submit"
              className="fr-send"
              disabled={busy || !input.trim()}
            >
              ↑
            </button>
          </form>
        </section>

        <div className="fr-frame-grain" aria-hidden />
        <div className="fr-frame-vignette" aria-hidden />
        <div className="fr-frame-scan" aria-hidden />
      </div>
    </div>
  );
}
