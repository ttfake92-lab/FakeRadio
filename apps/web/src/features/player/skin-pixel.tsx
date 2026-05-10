"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";
import type { ChatMessage } from "./use-chat-sse";
import { getPlaybackControlText } from "./player-view-model";

export type SkinPixelProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

function PxCover({
  track,
  size = 96,
  playing,
}: {
  track: { id: string; tone: [string, string, string] };
  size?: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 16;
    cv.width = W;
    cv.height = W;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const palette = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"];
    const seed = track.id.charCodeAt(1) * 91 + track.id.charCodeAt(0);
    const rnd = (n: number) =>
      Math.abs(Math.sin(seed + n * 12.9898)) * 43758.5453 % 1;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - 6;
        const dy = y - 6;
        const d = Math.sqrt(dx * dx + dy * dy) / 8;
        const noise = (rnd(x * 31 + y) - 0.5) * 0.25;
        const t = Math.min(1, Math.max(0, d + noise));
        const idx = t < 0.25 ? 3 : t < 0.55 ? 2 : t < 0.82 ? 1 : 0;
        ctx.fillStyle = palette[idx] as string;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = palette[0] as string;
    ctx.fillRect(7, 7, 2, 2);
    ctx.fillStyle = palette[3] as string;
    ctx.fillRect(8, 8, 1, 1);
  }, [track.id]);

  return (
    <div className={`px-cover ${playing ? "spin" : ""}`} style={{ width: size, height: size }}>
      <canvas
        ref={ref}
        style={{ width: size, height: size, imageRendering: "pixelated" }}
      />
    </div>
  );
}

function PxAvatar({ active, size = 24 }: { active?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    const id = setInterval(() => setFrame((f) => (f + 1) % 2), 220);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = 8;
    cv.height = 8;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const C = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"];
    const A = [
      "33333333",
      "31111113",
      "11212121",
      "11111111",
      "11000011",
      "11" + (frame ? "1111" : "0220") + "11",
      "31111113",
      "33333333",
    ];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const row = A[y] ?? "00000000";
        const c = parseInt(row[x] ?? "0", 10);
        ctx.fillStyle = C[c] as string;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [frame]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: "pixelated", display: "block" }}
    />
  );
}

function asciiBar(pct: number, len = 16) {
  const n = Math.round(pct * len);
  return "█".repeat(n) + "░".repeat(Math.max(0, len - n));
}

function PxBubble({
  msg,
  isUser,
  avatarSrc,
  onAvatarClick,
  onLong,
}: {
  msg: ChatMessage;
  isUser: boolean;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onLong: (kind: string, msg: ChatMessage) => void;
}) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = (kind: string) => {
    t.current = setTimeout(() => onLong(kind, msg), 480);
  };
  const cancel = () => {
    if (t.current) clearTimeout(t.current);
  };

  return (
    <div className={`px-row ${isUser ? "u" : "a"}`}>
      {!isUser && (
        <button type="button" className="px-avbtn" onClick={onAvatarClick} title="点击上传照片">
          {avatarSrc ? (
            <img src={avatarSrc} alt="dj" className="px-img-av" />
          ) : (
            <PxAvatar active={!!msg.streaming} size={24} />
          )}
        </button>
      )}
      <div
        className={`px-bubble ${isUser ? "u" : "a"}${msg.fav ? " fav" : ""}`}
        onMouseDown={() => start("fav")}
        onMouseUp={cancel}
        onMouseLeave={cancel}
        onTouchStart={() => start("fav")}
        onTouchEnd={cancel}
      >
        <div className="px-tag">{isUser ? "▷ YOU" : "◁ DJ"}</div>
        <div className="px-text">
          {msg.text}
          {msg.streaming ? (
            <span className="px-caret">▌</span>
          ) : (
            <span className="px-done">▼</span>
          )}
        </div>
        {msg.fav && <div className="px-fav">★ SAVED</div>}
      </div>
    </div>
  );
}

export function SkinPixel({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinPixelProps) {
  const {
    track,
    playing,
    loading,
    pos,
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
        <div className="fr-frame fr-frame-pixel" data-screen-label="02 Pixel">
          <section
            className="px-player"
            style={{ height: "100%", display: "flex", flexDirection: "column", gridRow: "1 / 3" }}
          >
            <div className="px-hdr">
              <span className="px-led">●</span>
              <span className="px-hdr-rt">FAKERADIO</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 16,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 48 }}>🎮</div>
              <div style={{ fontSize: 14 }}>FAKERADIO ONLINE</div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>{mood} · READY</div>
              <button
                className="px-btn primary"
                onClick={togglePlay}
                disabled={loading}
                style={{ marginTop: 12 }}
              >
                {loading ? "… LOADING" : "▶ START"}
              </button>
              <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8 }}>
                SELECT A TRACK TO START
              </div>
            </div>
            <div
              style={{
                width: "100%",
                borderTop: "2px solid #0f380f",
                marginTop: 16,
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  borderBottom: "1px solid #0f380f",
                  paddingBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{persona.short}</span>
                <span>OK</span>
              </div>
              <div style={{ padding: "12px 0", textAlign: "center", fontSize: 11, opacity: 0.5 }}>
                等待信号…
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const pct = track.dur > 0 ? pos / track.dur : 0;

  return (
    <div className="fr-stage">
      <div className="fr-frame fr-frame-pixel" data-screen-label="02 Pixel">
        <section className="px-player">
          <div className="px-hdr">
            <span className={`px-led ${playing ? "on" : ""}`}>●</span>
            <span>FAKERADIO</span>
            <span className="px-hdr-rt">{persona.tag.split(" · ")[1] || "FM"}</span>
          </div>
          <div className="px-mid">
            <PxCover track={track} size={140} playing={playing} />
            <div className="px-meta">
              <div className="px-title">{track.title}</div>
              <div className="px-artist">{track.artist}</div>
              <div className="px-album">『{track.album}』</div>
            </div>
          </div>
          <div
            className="px-progress"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
          >
            <span className="px-time">{fmt(pos)}</span>
            <span className="px-bar">{asciiBar(pct)}</span>
            <span className="px-time">{track.dur > 0 ? fmt(track.dur) : "--:--"}</span>
          </div>
          <div className="px-ctrls">
            <button
              className={`px-btn heart ${liked[track.id] ? "on" : ""}`}
              onClick={toggleLike}
            >
              {liked[track.id] ? "♥" : "♡"}
            </button>
            <button className="px-btn" onClick={() => skip(-1)} disabled={loading}>◀◀</button>
            <button className="px-btn primary" onClick={togglePlay} disabled={loading}>
              {getPlaybackControlText(loading, playing, "▶", "❚❚", "…")}
            </button>
            <button className="px-btn" onClick={() => skip(1)} disabled={loading}>▶▶</button>
            <div className="px-mood">MOOD: {mood.toUpperCase()}</div>
          </div>
        </section>

        <section className="px-chat">
          <div className="px-chat-hdr">
            <span>━━ DIALOG ━━</span>
            <span>{loading ? "LOADING.." : busy ? "SYNTHESIZING.." : "READY"}</span>
          </div>
          <div className="px-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <PxBubble
                key={m.id}
                msg={m}
                isUser={m.role === "user"}
                avatarSrc={avatarSrc}
                onAvatarClick={onAvatarClick}
                onLong={(kind, mm) => onBubbleAction(kind, mm)}
              />
            ))}
            {busy && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="px-typing">. . .</div>
            )}
          </div>
          <div className="px-chips">
            {QUICK_PROMPTS.map((q, i) => (
              <button
                key={i}
                className="px-chip"
                onClick={() => r.ask(q.prompt)}
                disabled={busy}
              >
                ▸{q.label}
              </button>
            ))}
          </div>
          <form
            className="px-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <span className="px-prompt">&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "DJ TALKING.." : "TYPE A MESSAGE.."}
              disabled={busy}
            />
            <button type="submit" className="px-send" disabled={busy || !input.trim()}>
              SEND
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
