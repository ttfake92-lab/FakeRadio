"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";
import type { ChatMessage } from "./use-chat-sse";
import { getPlaybackControlText } from "./player-view-model";

export type SkinBentoProps = {
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

function GlassBubble({
  msg,
  isUser,
  avatarSrc,
  onAvatarClick,
  onAction,
}: {
  msg: ChatMessage;
  isUser: boolean;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAction: (kind: string, msg: ChatMessage) => void;
}) {
  const [showReact, setShowReact] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    t.current = setTimeout(() => setShowReact(true), 420);
  };
  const cancel = () => {
    if (t.current) clearTimeout(t.current);
  };

  return (
    <div className={`bn-row ${isUser ? "u" : "a"}`}>
      {!isUser && (
        <button type="button" className="bn-avbtn" onClick={onAvatarClick}>
          {avatarSrc ? (
            <img src={avatarSrc} className="bn-avatar" alt="dj" />
          ) : (
            <div className="bn-wave">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={msg.streaming ? "on" : ""} />
              ))}
            </div>
          )}
        </button>
      )}
      <div className="bn-bub-wrap">
        <div
          className={`bn-bubble ${isUser ? "u" : "a"}${msg.fav ? " fav" : ""}`}
          onMouseDown={start}
          onMouseUp={cancel}
          onMouseLeave={cancel}
          onTouchStart={start}
          onTouchEnd={cancel}
        >
          {msg.text}
          {msg.streaming && <span className="bn-caret" />}
        </div>
        {msg.fav && <div className="bn-fav-pill">❤️ Saved</div>}
        {showReact && (
          <div className="bn-react" onMouseLeave={() => setShowReact(false)}>
            <button onClick={() => { onAction("fav", msg); setShowReact(false); }}>
              {msg.fav ? "♥" : "♡"}
            </button>
            <button onClick={() => { onAction("more", msg); setShowReact(false); }}>＋</button>
            <button onClick={() => { onAction("less", msg); setShowReact(false); }}>−</button>
            <button onClick={() => { onAction("copy", msg); setShowReact(false); }}>⎘</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkinBento({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinBentoProps) {
  const {
    track,
    next,
    playing,
    loading,
    pos,
    vol,
    liked,
    mood,
    setVol,
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

  const [sheet, setSheet] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sheet]);

  const pct = track.dur > 0 ? pos / track.dur : 0;
  const accent = track.tone[1];
  const bg = track.tone[0];

  if (!track) {
    return (
      <div className="fr-stage">
        <div
          className="fr-frame fr-frame-bento"
          data-screen-label="04 Bento"
          style={{ gridTemplateRows: "1fr" }}
        >
          <div className="bn-blur-bg" aria-hidden />
          <div className="bn-blur-veil" aria-hidden />
          <div className="bn-content">
            <header className="bn-hdr">
              <div className="bn-now">NOW PLAYING</div>
              <div className="bn-mood">{persona.short} · {mood}</div>
            </header>
            <div
              style={{
                position: "relative",
                zIndex: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 64 }}>🎧</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                FakeRadio 已连接
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                点击播放开始
              </div>
              <button
                onClick={togglePlay}
                disabled={loading}
                style={{
                  marginTop: 12,
                  padding: "8px 20px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontSize: 14,
                  cursor: "pointer",
                  backdropFilter: "blur(20px)",
                }}
              >
                {loading ? "准备中…" : "▶ 播放"}
              </button>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
                选择一首歌曲启动广播
              </div>
            </div>
            <div
              style={{
                width: "100%",
                borderTop: "1px solid rgba(255,255,255,0.1)",
                marginTop: 16,
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.4)",
                  paddingBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{persona.name} · {persona.short}</span>
                <span>待机</span>
              </div>
              <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "8px 0" }}>
                等待信号…
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fr-stage">
      <div
        className="fr-frame fr-frame-bento"
        data-screen-label="04 Bento"
        style={{ "--bn-accent": accent, "--bn-bg": bg } as React.CSSProperties}
      >
        <div className="bn-blur-bg" aria-hidden>
          <CoverArt track={track} playing={playing} />
        </div>
        <div className="bn-blur-veil" aria-hidden />

        <div className={`bn-content ${sheet ? "sheet-open" : ""}`}>
          <header className="bn-hdr">
            <div className="bn-now">NOW PLAYING</div>
            <div className="bn-mood">{persona.short} · {mood}</div>
            <button
              type="button"
              onClick={onAvatarClick}
              title="设置"
              style={{
                appearance: "none",
                border: 0,
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                fontSize: 14,
                cursor: "pointer",
                padding: "2px 6px",
                marginLeft: "auto",
              }}
            >
              ⚙
            </button>
          </header>

          <div className="bn-grid">
            <div className="bn-card bn-cover-card">
              <CoverArt track={track} playing={playing} />
              <div className="bn-cover-shine" />
            </div>
            <div className="bn-card bn-meta-card">
              <div className="bn-title">{track.title}</div>
              <div className="bn-artist">{track.artist}</div>
              <div className="bn-album">{track.album}</div>
              <button
                className={`bn-like ${liked[track.id] ? "on" : ""}`}
                onClick={toggleLike}
              >
                {liked[track.id] ? "♥ Saved" : "♡ Save"}
              </button>
            </div>
            <div className="bn-card bn-progress-card">
              <div
                className="bn-bar"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seek((e.clientX - rect.left) / rect.width);
                }}
              >
                <div className="bn-bar-fill" style={{ width: `${pct * 100}%` }} />
                <div className="bn-bar-knob" style={{ left: `${pct * 100}%` }} />
              </div>
              <div className="bn-times">
                <span>{fmt(pos)}</span>
                <span>−{fmt(track.dur - pos)}</span>
              </div>
              <div className="bn-ctrls">
                <button className="bn-ctl" onClick={() => skip(-1)} disabled={loading}>⏮</button>
                <button className="bn-ctl big" onClick={togglePlay} disabled={loading}>
                  {getPlaybackControlText(loading, playing, "▶", "❚❚", "…")}
                </button>
                <button className="bn-ctl" onClick={() => skip(1)} disabled={loading}>⏭</button>
              </div>
              <div className="bn-vol">
                <span>♪</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vol}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                />
              </div>
            </div>
            {next && (
              <div className="bn-card bn-next-card">
                <div className="bn-next-lbl">UP NEXT</div>
                <div className="bn-next-title">{next.title}</div>
                <div className="bn-next-artist">{next.artist}</div>
              </div>
            )}
          </div>

          <button
            className={`bn-sheet-handle ${sheet ? "open" : ""}`}
            onClick={() => setSheet((s) => !s)}
          >
            <div className="bn-handle-bar" />
            <div className="bn-handle-label">
              {sheet ? "收起" : `与 ${persona.short} 聊聊`}
            </div>
          </button>

          <div className={`bn-sheet ${sheet ? "open" : ""}`}>
            <div className="bn-sheet-hdr">
              <div className="bn-sheet-title">{persona.name} · {persona.short}</div>
              <div className="bn-sheet-sub">{loading ? "准备节目中…" : busy ? "正在合成…" : "在线"}</div>
            </div>
            <div className="bn-sheet-body" ref={scrollRef}>
              {messages.map((m) => (
                <GlassBubble
                  key={m.id}
                  msg={m}
                  isUser={m.role === "user"}
                  avatarSrc={avatarSrc}
                  onAvatarClick={onAvatarClick}
                  onAction={onBubbleAction}
                />
              ))}
              {busy && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="bn-typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
            <div className="bn-chips">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  className="bn-chip"
                  onClick={() => r.ask(q.prompt)}
                  disabled={busy}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <form
              className="bn-composer"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "DJ 正在说话…" : "iMessage"}
                disabled={busy}
              />
              <button type="submit" className="bn-send" disabled={busy || !input.trim()}>
                ↑
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
