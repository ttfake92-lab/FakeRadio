"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";
import type { ChatMessage } from "./use-chat-sse";
import { getPlaybackControlText } from "./player-view-model";

export type SkinTerminalProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

function asciiCover(track: { id: string }) {
  const seed = track.id.charCodeAt(1);
  const chars = [" ", ".", ":", "+", "*", "#", "@"];
  const W = 14;
  const H = 7;
  const lines: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const dx = x - W / 2;
      const dy = (y - H / 2) * 1.6;
      const d = Math.sqrt(dx * dx + dy * dy);
      const v = Math.max(0, 1 - d / (W / 2));
      const n = Math.abs(Math.sin(seed + x * 7.13 + y * 31.7));
      const idx = Math.min(chars.length - 1, Math.floor(v * 6 + n * 1.2));
      row += chars[idx];
    }
    lines.push(row);
  }
  return lines.join("\n");
}

function Spectrum({ playing, mood }: { playing: boolean; mood: string }) {
  const seed = mood.length;
  const cells = 24;
  let out = "";
  for (let i = 0; i < cells; i++) {
    const v = playing
      ? Math.abs(Math.sin(Date.now() / 200 + i * 0.7 + seed)) * 0.85 + 0.15
      : 0.1;
    const h = Math.floor(v * 7);
    out += ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"][h];
  }
  return <span style={{ letterSpacing: -2 }}>{out}</span>;
}

export function SkinTerminal({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinTerminalProps) {
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
  const [, rerender] = useState(0);

  useEffect(() => {
    const id = setInterval(() => rerender((n) => n + 1), 110);
    return () => clearInterval(id);
  }, [rerender]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const pct = track.dur > 0 ? (pos / track.dur) * 100 : 0;
  const handle = persona.short.toLowerCase() + "_fm";

  if (!track) {
    return (
      <div className="fr-stage">
        <div className="fr-frame fr-frame-terminal" data-screen-label="03 Terminal">
          <div className="term-titlebar">
            <span>● FAKERADIO.TTY</span>
            <button className="term-btn" onClick={onAvatarClick} style={{ marginLeft: "auto" }}>
              SET-AV
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 36 }}>📡</div>
            <div style={{ fontSize: 16, fontWeight: "bold" }}>FAKERADIO ONLINE</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{mood} · READY</div>
            <button className="term-btn" onClick={togglePlay} disabled={loading} style={{ marginTop: 12 }}>
              {loading ? "... PREPARING" : "▶ START"}
            </button>
            <div style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>
              SELECT A TRACK TO START STREAMING
            </div>
          </div>
          <div
            style={{
              borderTop: "1px solid #003300",
              marginTop: 12,
              paddingTop: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                borderBottom: "1px solid #003300",
                paddingBottom: 6,
                display: "flex",
                justifyContent: "space-between",
                color: "#008800",
              }}
            >
              <span>{persona.name} @ {persona.tag.split(" · ")[1]}</span>
              <span>READY</span>
            </div>
            <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, opacity: 0.5 }}>
              &gt; WAITING FOR SIGNAL…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fr-stage">
      <div className="fr-frame fr-frame-terminal" data-screen-label="03 Terminal">
        <div className="term-titlebar">
          <span>● ● ●</span>
          <span className="term-title">
            user@fakeradio:~/{handle} — {fmt(pos)}/{track.dur > 0 ? fmt(track.dur) : "--:--"}
          </span>
          <span className="term-rec">REC</span>
        </div>
        <section className="term-player">
          <pre className="term-cover">{asciiCover(track)}</pre>
          <div className="term-meta">
            <div className="term-line">
              <span className="term-key">file</span>{" "}
              <span className="term-val">now_playing.mp3</span>
            </div>
            <div className="term-line title">{track.title}</div>
            <div className="term-line">
              <span className="term-key">artist</span> {track.artist}
            </div>
            <div className="term-line">
              <span className="term-key">album</span> {track.album}
            </div>
            <div className="term-line">
              <span className="term-key">mood</span>{" "}
              <span className="term-mood">[{mood}]</span>
            </div>
            <div className="term-spec">
              <Spectrum playing={playing} mood={mood} />
            </div>
          </div>
        </section>
        <div className="term-progress">
          <span>[</span>
          <span
            className="term-pbar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
            style={{ cursor: "pointer" }}
          >
            <span className="term-pfill" style={{ width: `${pct}%` }} />
          </span>
          <span>]</span>
          <span className="term-pct">{Math.floor(pct).toString().padStart(2, "0")}%</span>
        </div>
        <div className="term-ctrls">
          <button className="term-btn" onClick={() => skip(-1)} disabled={loading}>
            [ &lt;&lt; prev ]
          </button>
          <button className="term-btn primary" onClick={togglePlay} disabled={loading}>
            [ {getPlaybackControlText(loading, playing, "play ", "pause", "wait ")} ]
          </button>
          <button className="term-btn" onClick={() => skip(1)} disabled={loading}>
            [ next &gt;&gt; ]
          </button>
          <button
            className={`term-btn ${liked[track.id] ? "on" : ""}`}
            onClick={toggleLike}
          >
            [ {liked[track.id] ? "★" : "☆"} fav ]
          </button>
        </div>

        <section className="term-chat">
          <div className="term-chat-hdr">
            ── #{handle} ── {loading ? "preparing ..." : busy ? "buffering ..." : "idle"} ──
          </div>
          <div className="term-chat-body" ref={scrollRef}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              const speaker = isUser ? "you" : handle;
              return (
                <div
                  key={m.id}
                  className={`term-msg ${isUser ? "u" : "a"}${m.fav ? " fav" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onBubbleAction("fav", m);
                  }}
                  onDoubleClick={() => onBubbleAction("fav", m)}
                >
                  <span className="term-speaker">
                    {!isUser && (
                      <button
                        type="button"
                        onClick={onAvatarClick}
                        className="term-avbtn"
                        title="点击上传 DJ 头像"
                      >
                        {avatarSrc ? (
                          <img src={avatarSrc} className="term-avatar" alt="dj" />
                        ) : (
                          <span className="term-avtxt">▣</span>
                        )}
                      </button>
                    )}
                    &lt;{speaker}&gt;
                  </span>
                  <span className="term-msg-text">
                    {m.text}
                    {m.streaming && <span className="term-caret">▌</span>}
                    {m.fav && <span className="term-fav"> ★</span>}
                  </span>
                </div>
              );
            })}
            {busy && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="term-msg a">
                <span className="term-speaker">&lt;{handle}&gt;</span>
                <span className="term-msg-text">_</span>
              </div>
            )}
          </div>
          <div className="term-chips">
            {[
              { label: "/skip", prompt: QUICK_PROMPTS[0]!.prompt },
              { label: "/quiet", prompt: QUICK_PROMPTS[1]!.prompt },
              { label: "/slow", prompt: QUICK_PROMPTS[2]!.prompt },
              { label: "/about", prompt: QUICK_PROMPTS[3]!.prompt },
              { label: "/goodnight", prompt: QUICK_PROMPTS[4]!.prompt },
            ].map((q, i) => (
              <button
                key={i}
                className="term-chip"
                onClick={() => r.ask(q.prompt)}
                disabled={busy}
              >
                {q.label}
              </button>
            ))}
          </div>
          <form
            className="term-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <span className="term-prompt">{handle}@fm:~$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "[locked]" : "type and hit return…"}
              disabled={busy}
            />
            <span className="term-bcaret">{busy ? "" : "▌"}</span>
          </form>
        </section>
        <div className="term-scan" aria-hidden />
      </div>
    </div>
  );
}
