"use client";

import { useRef, useEffect } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";

export type SkinPixelProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

export function SkinPixel({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinPixelProps) {
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
        <div className="fr-frame fr-frame-pixel">Loading...</div>
      </div>
    );
  }

  const pct = (pos / track.dur) * 100;

  return (
    <div className="fr-stage">
      <div className="fr-frame fr-frame-pixel" data-screen-label="02 Pixel">
        <style>{`
          .fr-frame-pixel {
            --pixel-green: #8bac0f;
            --pixel-dark: #0f1a0f;
            background: var(--pixel-dark);
            font-family: "VT323", "Press Start 2P", monospace;
            color: var(--pixel-green);
          }
          .px-player {
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .px-hdr {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--pixel-green);
            padding-bottom: 8px;
          }
          .px-hdr-rt { font-size: 10px; }
          .px-led.on { color: #f00; }
          .px-mid { display: flex; gap: 12px; align-items: center; }
          .px-img-av {
            width: 64px;
            height: 64px;
            border: 2px solid var(--pixel-green);
            image-rendering: pixelated;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
          }
          .px-meta { flex: 1; }
          .px-title { font-size: 14px; margin-bottom: 4px; }
          .px-artist { font-size: 11px; opacity: 0.7; }
          .px-tag { font-size: 9px; opacity: 0.5; margin-top: 4px; }
          .px-progress { display: flex; flex-direction: column; gap: 4px; }
          .px-pbar {
            height: 8px;
            border: 2px solid var(--pixel-green);
            position: relative;
          }
          .px-pfill {
            height: 100%;
            background: var(--pixel-green);
          }
          .px-time { display: flex; justify-content: space-between; font-size: 10px; }
          .px-ctrls {
            display: flex;
            justify-content: center;
            gap: 8px;
          }
          .px-btn {
            font-family: inherit;
            font-size: 12px;
            padding: 4px 10px;
            border: 2px solid var(--pixel-green);
            background: transparent;
            color: var(--pixel-green);
            cursor: pointer;
          }
          .px-btn.primary { background: var(--pixel-green); color: var(--pixel-dark); }
          .px-chat { flex: 1; display: flex; flex-direction: column; border-top: 2px solid var(--pixel-green); }
          .px-chat-hdr { padding: 8px; font-size: 10px; border-bottom: 1px solid var(--pixel-green); display: flex; justify-content: space-between; }
          .px-chat-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
          .px-msg { font-size: 12px; line-height: 1.4; }
          .px-msg.a { color: var(--pixel-green); }
          .px-msg.u { color: #fff; text-align: right; }
          .px-typing { display: flex; gap: 4px; }
          .px-typing span { width: 8px; height: 8px; background: var(--pixel-green); animation: pixelBlink 0.8s step-end infinite; }
          @keyframes pixelBlink { 50% { opacity: 0; } }
          .px-chips { display: flex; gap: 4px; padding: 4px 8px; border-top: 1px solid var(--pixel-green); }
          .px-chip { font-family: inherit; font-size: 9px; padding: 2px 6px; border: 1px solid var(--pixel-green); background: transparent; color: var(--pixel-green); cursor: pointer; }
          .px-chip:hover { background: var(--pixel-green); color: var(--pixel-dark); }
          .px-composer { display: flex; gap: 4px; padding: 8px; border-top: 1px solid var(--pixel-green); }
          .px-composer input { flex: 1; font-family: inherit; font-size: 11px; padding: 4px; border: 2px solid var(--pixel-green); background: transparent; color: var(--pixel-green); outline: none; }
          .px-send { font-family: inherit; font-size: 11px; padding: 4px 8px; border: 2px solid var(--pixel-green); background: var(--pixel-green); color: var(--pixel-dark); cursor: pointer; }
        `}</style>

        <section className="px-player">
          <div className="px-hdr">
            <span className={`px-led ${playing ? "on" : ""}`}>●</span>
            <span className="px-hdr-rt">FAKERADIO</span>
          </div>
          <div className="px-mid">
            <div className="px-img-av">
              {avatarSrc ? (
                <img src={avatarSrc} alt="dj" width={64} height={64} style={{ objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 10 }}>NO IMG</span>
              )}
            </div>
            <div className="px-meta">
              <div className="px-title">{track.title}</div>
              <div className="px-artist">{track.artist}</div>
              <div className="px-tag">{mood}</div>
            </div>
          </div>
          <div className="px-progress" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - rect.left) / rect.width);
          }}>
            <div className="px-pbar">
              <div className="px-pfill" style={{ width: `${pct}%` }} />
            </div>
            <div className="px-time">
              <span>{fmt(pos)}</span>
              <span>{fmt(track.dur)}</span>
            </div>
          </div>
          <div className="px-ctrls">
            <button className="px-btn" onClick={() => skip(-1)}>◀◀</button>
            <button className="px-btn primary" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
            <button className="px-btn" onClick={() => skip(1)}>▶▶</button>
            <button className={`px-btn ${liked[track.id] ? "primary" : ""}`} onClick={toggleLike}>
              {liked[track.id] ? "♥" : "♡"}
            </button>
          </div>
        </section>

        <section className="px-chat">
          <div className="px-chat-hdr">
            <span>{persona.short}</span>
            <span>{busy ? "..." : "OK"}</span>
          </div>
          <div className="px-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`px-msg ${m.role}`}>{m.text}</div>
            ))}
            {busy && (
              <div className="px-typing"><span /><span /><span /></div>
            )}
          </div>
          <div className="px-chips">
            {QUICK_PROMPTS.map((q, i) => (
              <button key={i} className="px-chip" onClick={() => r.ask(q.prompt)} disabled={busy}>{q.label}</button>
            ))}
          </div>
          <form className="px-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={busy ? "..." : ">>"} disabled={busy} />
            <button type="submit" className="px-send" disabled={busy || !input.trim()}>SEND</button>
          </form>
        </section>
      </div>
    </div>
  );
}
