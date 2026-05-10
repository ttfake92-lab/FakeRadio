"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";

export type SkinBentoProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

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

  const [sheet, setSheet] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sheet]);

  if (!track) {
    return (
      <div className="fr-stage">
        <div className="fr-frame fr-frame-bento">Loading...</div>
      </div>
    );
  }

  const pct = pos / track.dur;
  const accent = track.tone[1];
  const bg = track.tone[0];

  return (
    <div className="fr-stage">
      <style>{`
        .fr-frame-bento {
          background: ${bg};
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
          --bn-accent: ${accent};
        }
        .bn-blur-bg {
          position: absolute;
          inset: 0;
          filter: blur(60px) saturate(1.3);
          transform: scale(1.2);
          opacity: 0.4;
        }
        .bn-blur-veil {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(20px);
        }
        .bn-content {
          position: relative;
          z-index: 2;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 20px 16px;
          gap: 12px;
        }
        .bn-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .bn-now {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.5);
        }
        .bn-mood {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
        }
        .bn-grid {
          display: grid;
          grid-template-columns: 100px 1fr;
          grid-template-rows: auto auto auto;
          gap: 10px;
        }
        .bn-card {
          background: rgba(255,255,255,0.08);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 12px;
        }
        .bn-cover-card {
          grid-row: 1 / 4;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 12px;
          position: relative;
        }
        .bn-cover-shine {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
          pointer-events: none;
        }
        .bn-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bn-artist { font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 2px; }
        .bn-album { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }
        .bn-like {
          appearance: none;
          margin-top: 8px;
          padding: 4px 12px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 20px;
          background: transparent;
          color: rgba(255,255,255,0.6);
          font-size: 12px;
          cursor: pointer;
        }
        .bn-like.on { border-color: #ff6b6b; color: #ff6b6b; }
        .bn-bar {
          height: 4px;
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
          position: relative;
          cursor: pointer;
        }
        .bn-bar-fill {
          height: 100%;
          background: var(--bn-accent);
          border-radius: 999px;
        }
        .bn-bar-knob {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .bn-times { display: flex; justify-content: space-between; font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 6px; font-variant-numeric: tabular-nums; }
        .bn-ctrls { display: flex; justify-content: center; gap: 16px; margin-top: 10px; }
        .bn-ctl { appearance: none; border: 0; background: transparent; color: #fff; font-size: 18px; cursor: pointer; padding: 4px; }
        .bn-ctl.big { font-size: 26px; }
        .bn-vol { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.5); }
        .bn-vol input { flex: 1; accent-color: var(--bn-accent); }
        .bn-next-lbl { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
        .bn-next-title { font-size: 13px; color: rgba(255,255,255,0.7); }
        .bn-next-artist { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }
        .bn-sheet-handle {
          appearance: none;
          width: 100%;
          padding: 12px;
          border: 0;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(20px);
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-top: auto;
        }
        .bn-handle-bar { width: 32px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
        .bn-sheet {
          display: none;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          margin-top: 8px;
        }
        .bn-sheet.open { display: flex; }
        .bn-sheet-hdr { display: flex; justify-content: space-between; align-items: center; }
        .bn-sheet-title { font-size: 13px; font-weight: 600; color: #fff; }
        .bn-sheet-sub { font-size: 10px; color: rgba(255,255,255,0.4); }
        .bn-sheet-body {
          flex: 1;
          overflow-y: auto;
          max-height: 200px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bn-bub-row { display: flex; gap: 8px; align-items: flex-end; }
        .bn-bub-row.u { flex-direction: row-reverse; }
        .bn-avbtn { appearance: none; border: 0; background: transparent; padding: 0; cursor: pointer; border-radius: 50%; }
        .bn-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
        .bn-wave { display: flex; align-items: flex-end; gap: 2px; height: 28px; }
        .bn-wave span { display: block; width: 3px; background: var(--bn-accent); border-radius: 2px; opacity: 0.6; }
        .bn-wave span.on { opacity: 1; animation: bnWave 0.8s ease-in-out infinite; }
        .bn-wave span:nth-child(1) { height: 8px; animation-delay: 0ms; }
        .bn-wave span:nth-child(2) { height: 14px; animation-delay: 90ms; }
        .bn-wave span:nth-child(3) { height: 20px; animation-delay: 180ms; }
        .bn-wave span:nth-child(4) { height: 14px; animation-delay: 270ms; }
        .bn-wave span:nth-child(5) { height: 8px; animation-delay: 360ms; }
        @keyframes bnWave { 0%,100% { height: 8px; } 50% { height: 20px; } }
        .bn-bub-wrap { max-width: 70%; }
        .bn-bubble {
          padding: 8px 12px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.5;
          backdrop-filter: blur(20px);
        }
        .bn-bubble.a { background: rgba(255,255,255,0.1); color: #fff; border-bottom-left-radius: 2px; }
        .bn-bubble.u { background: var(--bn-accent); color: #fff; border-bottom-right-radius: 2px; }
        .bn-fav-pill { font-size: 10px; color: #ff6b6b; margin-top: 4px; }
        .bn-typing { display: flex; gap: 4px; padding: 4px 0; }
        .bn-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--bn-accent); opacity: 0.6; animation: bnTyping 1.2s ease-in-out infinite; }
        .bn-typing span:nth-child(2) { animation-delay: 0.2s; }
        .bn-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bnTyping { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        .bn-chips { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; }
        .bn-chip { appearance: none; flex: 1; min-width: 0; height: 32px; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.7); font-size: 11px; cursor: pointer; white-space: nowrap; }
        .bn-chip:hover { background: rgba(255,255,255,0.1); }
        .bn-chip:disabled { opacity: 0.4; }
        .bn-composer { display: flex; gap: 8px; align-items: center; }
        .bn-composer input { flex: 1; appearance: none; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; background: rgba(255,255,255,0.08); color: #fff; font-size: 13px; outline: none; }
        .bn-composer input::placeholder { color: rgba(255,255,255,0.3); }
        .bn-send { appearance: none; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--bn-accent); color: #fff; font-size: 16px; cursor: pointer; }
      `}</style>

      <div
        className="fr-frame fr-frame-bento"
        data-screen-label="04 Bento"
        style={{ "--bn-accent": accent, "--bn-bg": bg } as React.CSSProperties}
      >
        <div className="bn-blur-bg" aria-hidden />
        <div className="bn-blur-veil" aria-hidden />

        <div className={`bn-content ${sheet ? "sheet-open" : ""}`}>
          <header className="bn-hdr">
            <div className="bn-now">NOW PLAYING</div>
            <div className="bn-mood">{persona.short} · {mood}</div>
          </header>

          <div className="bn-grid">
            <div className="bn-card bn-cover-card">
              <div style={{ width: 80, height: 80, borderRadius: 8, background: `linear-gradient(135deg, ${track.tone[2]}, ${track.tone[0]})` }} />
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
                <button className="bn-ctl" onClick={() => skip(-1)}>⏮</button>
                <button className="bn-ctl big" onClick={togglePlay}>
                  {playing ? "❚❚" : "▶"}
                </button>
                <button className="bn-ctl" onClick={() => skip(1)}>⏭</button>
              </div>
              <div className="bn-vol">
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
            {next && (
              <div className="bn-card bn-next-card">
                <div className="bn-next-lbl">UP NEXT</div>
                <div className="bn-next-title">{next.title}</div>
                <div className="bn-next-artist">{next.artist}</div>
              </div>
            )}
          </div>

          <button className="bn-sheet-handle" onClick={() => setSheet((s) => !s)}>
            <div className="bn-handle-bar" />
            <div className="bn-handle-label">
              {sheet ? "收起" : `与 ${persona.short} 聊聊`}
            </div>
          </button>

          <div className={`bn-sheet ${sheet ? "open" : ""}`}>
            <div className="bn-sheet-hdr">
              <div className="bn-sheet-title">{persona.name} · {persona.short}</div>
              <div className="bn-sheet-sub">{busy ? "正在合成…" : "在线"}</div>
            </div>
            <div className="bn-sheet-body" ref={scrollRef}>
              {messages.map((m) => (
                <div key={m.id} className={`bn-bub-row ${m.role}`}>
                  <button className="bn-avbtn" onClick={onAvatarClick}>
                    {avatarSrc ? (
                      <img className="bn-avatar" src={avatarSrc} alt="dj" />
                    ) : (
                      <div className="bn-wave">
                        {[1,2,3,4,5].map(i => (
                          <span key={i} className={m.streaming ? "on" : ""} />
                        ))}
                      </div>
                    )}
                  </button>
                  <div className="bn-bub-wrap">
                    <div className={`bn-bubble ${m.role}`}>{m.text}</div>
                    {m.fav && <div className="bn-fav-pill">❤️ Saved</div>}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="bn-typing"><span /><span /><span /></div>
              )}
            </div>
            <div className="bn-chips">
              {QUICK_PROMPTS.map((q, i) => (
                <button key={i} className="bn-chip" onClick={() => r.ask(q.prompt)} disabled={busy}>
                  {q.label}
                </button>
              ))}
            </div>
            <form className="bn-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "DJ 正在说话…" : "iMessage"}
                disabled={busy}
              />
              <button type="submit" className="bn-send" disabled={busy || !input.trim()}>↑</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
