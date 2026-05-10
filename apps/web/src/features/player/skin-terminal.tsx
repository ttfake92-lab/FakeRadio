"use client";

import { useRef, useEffect } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";

export type SkinTerminalProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

export function SkinTerminal({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinTerminalProps) {
  const {
    track,
    playing,
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
  } = r;

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!track) {
    return (
      <div className="fr-stage">
        <div className="fr-frame fr-frame-term">Loading...</div>
      </div>
    );
  }

  const pct = (pos / track.dur) * 100;

  return (
    <div className="fr-stage">
      <style>{`
        .fr-frame-term {
          background: #0a0a0a;
          color: #00ff00;
          font-family: "JetBrains Mono", "Fira Code", monospace;
          font-size: 13px;
        }
        .term-player {
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-bottom: 1px solid #003300;
        }
        .term-titlebar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #003300;
          padding-bottom: 6px;
          margin-bottom: 4px;
        }
        .term-titlebar span { font-size: 11px; opacity: 0.6; }
        .term-avbtn {
          appearance: none;
          border: 1px solid #003300;
          background: transparent;
          color: #00ff00;
          font-family: inherit;
          font-size: 11px;
          padding: 2px 6px;
          cursor: pointer;
        }
        .term-rec {
          color: #ff0000;
          animation: termBlink 1s step-end infinite;
        }
        @keyframes termBlink { 50% { opacity: 0; } }
        .term-line { display: flex; gap: 8px; align-items: center; }
        .term-title { color: #00ff00; font-weight: bold; }
        .term-spec { opacity: 0.6; font-size: 11px; }
        .term-mood { font-size: 10px; color: #008800; }
        .term-progress { display: flex; align-items: center; gap: 6px; }
        .term-pbar { flex: 1; height: 4px; background: #003300; border-radius: 2px; overflow: hidden; }
        .term-pfill { height: 100%; background: #00ff00; }
        .term-val { font-size: 10px; width: 80px; text-align: right; }
        .term-ctrls { display: flex; gap: 6px; }
        .term-btn {
          font-family: inherit;
          font-size: 11px;
          padding: 3px 10px;
          border: 1px solid #003300;
          background: transparent;
          color: #00ff00;
          cursor: pointer;
        }
        .term-btn:hover { background: #003300; }
        .term-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          border-top: 1px solid #003300;
        }
        .term-chat-hdr {
          padding: 6px 12px;
          font-size: 10px;
          border-bottom: 1px solid #003300;
          display: flex;
          justify-content: space-between;
          color: #008800;
        }
        .term-chat-body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .term-msg { font-size: 12px; line-height: 1.5; }
        .term-msg.a { color: #00ff00; }
        .term-msg-text { margin-top: 2px; }
        .term-msg-name { font-size: 10px; color: #008800; margin-bottom: 2px; }
        .term-msg.u { color: #88ff88; text-align: right; }
        .term-caret {
          display: inline-block;
          width: 8px;
          height: 14px;
          background: #00ff00;
          animation: termCursor 1s step-end infinite;
          vertical-align: middle;
          margin-left: 2px;
        }
        @keyframes termCursor { 50% { opacity: 0; } }
        .term-bcaret {
          display: inline-block;
          width: 8px;
          height: 14px;
          background: #00ff00;
          animation: termCursor 1s step-end infinite;
          vertical-align: middle;
        }
        .term-chips { display: flex; gap: 4px; padding: 6px 12px; border-top: 1px solid #003300; flex-wrap: wrap; }
        .term-chip { font-family: inherit; font-size: 10px; padding: 2px 8px; border: 1px solid #003300; background: transparent; color: #00ff00; cursor: pointer; }
        .term-chip:hover { background: #003300; }
        .term-chip:disabled { opacity: 0.4; }
        .term-composer { display: flex; gap: 4px; padding: 8px 12px; border-top: 1px solid #003300; }
        .term-prompt { color: #00ff00; font-size: 12px; white-space: nowrap; }
        .term-composer input {
          flex: 1;
          font-family: inherit;
          font-size: 12px;
          padding: 4px 8px;
          border: 1px solid #003300;
          background: transparent;
          color: #00ff00;
          outline: none;
        }
        .term-composer input:focus { border-color: #00ff00; }
        .term-speaker { font-size: 12px; }
      `}</style>

      <div className="fr-frame fr-frame-term" data-screen-label="03 Terminal">
        <section className="term-player">
          <div className="term-titlebar">
            <span>
              <span className={`term-rec ${playing ? "" : ""}`}>●</span>{" "}
              FAKERADIO.TTY{" "}
            </span>
            <button className="term-avbtn" onClick={onAvatarClick}>
              {avatarSrc ? "CHG-AV" : "SET-AV"}
            </button>
          </div>
          <div className="term-line">
            <span className="term-speaker">🔊</span>
            <span className="term-title">{track.title}</span>
            <span className="term-spec">
              {track.artist} / {track.album}
            </span>
          </div>
          <div className="term-line">
            <span className="term-mood">[{mood}]</span>
            <span className="term-val">
              {fmt(pos)} / {fmt(track.dur)}
            </span>
          </div>
          <div className="term-progress" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - rect.left) / rect.width);
          }}>
            <div className="term-pbar">
              <div className="term-pfill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="term-ctrls">
            <button className="term-btn" onClick={() => skip(-1)}>⏮</button>
            <button className="term-btn" onClick={togglePlay}>
              {playing ? "⏸" : "▶"}
            </button>
            <button className="term-btn" onClick={() => skip(1)}>⏭</button>
            <button
              className="term-btn"
              onClick={toggleLike}
              style={{ color: liked[track.id] ? "#ff8800" : undefined }}
            >
              {liked[track.id] ? "♥" : "♡"}
            </button>
          </div>
        </section>

        <section className="term-chat">
          <div className="term-chat-hdr">
            <span>{persona.name} @ {persona.tag.split(" · ")[1]}</span>
            <span>{busy ? "PROCESSING..." : "READY"}</span>
          </div>
          <div className="term-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`term-msg ${m.role}`}>
                <div className="term-msg-name">
                  {m.role === "assistant" ? persona.short : "YOU"}
                </div>
                <div className="term-msg-text">
                  {m.text}
                  {m.streaming && <span className="term-bcaret" />}
                </div>
              </div>
            ))}
          </div>
          <div className="term-chips">
            {QUICK_PROMPTS.map((q, i) => (
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
            <span className="term-prompt">&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "..." : "message..."}
              disabled={busy}
            />
          </form>
        </section>
      </div>
    </div>
  );
}
