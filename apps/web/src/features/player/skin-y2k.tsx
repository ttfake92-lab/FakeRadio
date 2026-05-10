"use client";

import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";

export type SkinY2KProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

function Win({
  title,
  x,
  y,
  w,
  h,
  z,
  onFocus,
  children,
  accent = "#000080",
  onClose,
}: {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  onFocus: () => void;
  children: React.ReactNode;
  accent?: string;
  onClose?: () => void;
}) {
  const [pos, setPos] = useState({ x, y });
  const drag = useRef<((ev: MouseEvent) => void) | null>(null);

  const onDown = (e: React.MouseEvent) => {
    onFocus?.();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = pos.x;
    const oy = pos.y;
    drag.current = (ev: MouseEvent) => setPos({ x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) });
    const up = () => {
      if (drag.current) window.removeEventListener("mousemove", drag.current);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", drag.current);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="y2k-win"
      style={{ left: pos.x, top: pos.y, width: w, height: h, zIndex: z, "--win-accent": accent } as React.CSSProperties}
      onMouseDown={onFocus}
    >
      <div className="y2k-titlebar" onMouseDown={onDown}>
        <span className="y2k-title">{title}</span>
        <span className="y2k-tbtns">
          <button className="y2k-tbtn">_</button>
          <button className="y2k-tbtn">▢</button>
          <button className="y2k-tbtn x" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="y2k-winbody">{children}</div>
    </div>
  );
}

export function SkinY2K({
  r,
  persona,
  avatarSrc,
  onAvatarClick,
}: SkinY2KProps) {
  const {
    track,
    playing,
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

  const [zPlayer, setZPlayer] = useState(2);
  const [zChat, setZChat] = useState(1);
  const focusPlayer = () => { setZPlayer(2); setZChat(1); };
  const focusChat = () => { setZPlayer(1); setZChat(2); };
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const pct = pos / track.dur;
  const handle = persona.short || "DJ";
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fr-stage">
      <style>{`
        .fr-frame-y2k {
          background: #008080;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
          user-select: none;
        }
        .y2k-desktop {
          position: absolute;
          inset: 0;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .y2k-icon { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: default; width: 64px; }
        .y2k-iconart { font-size: 28px; }
        .y2k-iconlabel { font-size: 11px; color: #fff; text-shadow: 1px 1px 0 #000; text-align: center; }
        .y2k-win {
          position: absolute;
          border: 2px solid;
          border-color: #fff #808080 #808080 #fff;
          background: #c0c0c0;
          display: flex;
          flex-direction: column;
        }
        .y2k-titlebar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 3px;
          background: linear-gradient(90deg, var(--win-accent, #000080), #1084d0);
          cursor: default;
        }
        .y2k-title { color: #fff; font-size: 12px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .y2k-tbtns { display: flex; gap: 2px; }
        .y2k-tbtn {
          width: 16px; height: 14px;
          border: 1px solid;
          border-color: #fff #808080 #808080 #fff;
          background: #c0c0c0;
          font-size: 10px; line-height: 1; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0;
        }
        .y2k-tbtn:active { border-color: #808080 #fff #fff #808080; }
        .y2k-tbtn.x { color: #000; }
        .y2k-winbody { flex: 1; overflow: hidden; background: #c0c0c0; }
        .y2k-player { padding: 8px; display: flex; flex-direction: column; gap: 6px; height: 100%; }
        .y2k-screen { background: #000; border: 2px solid; border-color: #808080 #fff #fff #808080; padding: 6px; }
        .y2k-vu { display: flex; gap: 2px; height: 20px; align-items: flex-end; margin-bottom: 4px; }
        .y2k-vubar { display: block; width: 10px; background: #004400; border: 1px solid #0a0a0a; border-radius: 1px; transition: background 0.05s; }
        .y2k-vubar.on { background: #00ff66; box-shadow: 0 0 4px #00ff66; }
        .y2k-track { height: 14px; overflow: hidden; background: #000; border: 1px solid #404040; margin-bottom: 4px; }
        .y2k-marquee { display: flex; white-space: nowrap; animation: y2kScroll 12s linear infinite; font-size: 11px; color: #00ff00; line-height: 14px; }
        @keyframes y2kScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .y2k-album { font-size: 10px; color: #00ff00; text-align: center; font-family: "Courier New", monospace; }
        .y2k-progress { cursor: pointer; }
        .y2k-pblocks { display: flex; gap: 1px; height: 16px; }
        .y2k-pblock { flex: 1; background: #808080; border: 1px solid; border-color: #fff #404040 #404040 #fff; }
        .y2k-pblock.on { background: #0000aa; border-color: #0000aa; }
        .y2k-times { display: flex; justify-content: space-between; font-size: 10px; color: #000; font-family: "Courier New", monospace; }
        .y2k-ctrls { display: flex; justify-content: center; gap: 6px; }
        .y2k-btn {
          font-family: "Courier New", monospace; font-size: 14px;
          padding: 4px 10px;
          border: 2px solid; border-color: #fff #808080 #808080 #fff;
          background: #c0c0c0; color: #000; cursor: pointer;
        }
        .y2k-btn:active { border-color: #808080 #fff #fff #808080; }
        .y2k-btn.on { color: #c00; }
        .y2k-vol { display: flex; align-items: center; gap: 4px; }
        .y2k-vol label { font-size: 10px; font-weight: bold; }
        .y2k-vol input { flex: 1; accent-color: #000080; }
        .y2k-mood { font-size: 10px; color: #404040; white-space: nowrap; }
        .y2k-chat { display: flex; flex-direction: column; height: 100%; }
        .y2k-chat-hdr { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #c0c0c0; border-bottom: 1px solid #808080; }
        .y2k-avbtn { appearance: none; border: 2px solid; border-color: #fff #808080 #808080 #fff; background: #c0c0c0; padding: 0; cursor: pointer; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
        .y2k-avimg { width: 36px; height: 36px; object-fit: cover; display: block; }
        .y2k-avemoji { font-size: 20px; }
        .y2k-chat-name { font-size: 12px; font-weight: bold; color: #000; }
        .y2k-chat-status { font-size: 10px; color: #404040; }
        .y2k-chat-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; background: #fff; }
        .y2k-msg { font-size: 12px; line-height: 1.4; }
        .y2k-msg-name { font-size: 10px; font-weight: bold; margin-bottom: 1px; }
        .y2k-msg.a .y2k-msg-name { color: #5b3ea0; }
        .y2k-msg.u .y2k-msg-name { color: #c00; }
        .y2k-msg-text { display: inline; }
        .y2k-msg-text.fav { color: #c00; }
        .y2k-caret { display: inline-block; width: 8px; height: 12px; background: #5b3ea0; animation: y2kBlink 0.8s step-end infinite; vertical-align: middle; margin-left: 1px; }
        @keyframes y2kBlink { 50% { opacity: 0; } }
        .y2k-chips { display: flex; gap: 4px; padding: 4px 8px; flex-wrap: wrap; background: #c0c0c0; border-top: 1px solid #808080; }
        .y2k-chip { font-family: inherit; font-size: 10px; padding: 2px 6px; border: 2px solid; border-color: #fff #808080 #808080 #fff; background: #c0c0c0; color: #000; cursor: pointer; }
        .y2k-chip:hover { background: #d4d4d4; }
        .y2k-chip:active { border-color: #808080 #fff #fff #808080; }
        .y2k-chip:disabled { color: #808080; }
        .y2k-composer { display: flex; gap: 4px; padding: 6px 8px; background: #c0c0c0; border-top: 1px solid #808080; }
        .y2k-composer input { flex: 1; font-family: inherit; font-size: 11px; padding: 4px; border: 2px solid; border-color: #808080 #fff #fff #808080; background: #fff; color: #000; outline: none; }
        .y2k-send { font-family: inherit; font-size: 11px; padding: 4px 10px; border: 2px solid; border-color: #fff #808080 #808080 #fff; background: #c0c0c0; color: #000; cursor: pointer; }
        .y2k-send:active { border-color: #808080 #fff #fff #808080; }
        .y2k-send:disabled { color: #808080; }
        .y2k-taskbar {
          position: absolute; bottom: 0; left: 0; right: 0; height: 28px;
          background: #c0c0c0; border-top: 2px solid #fff;
          display: flex; align-items: center; gap: 4px; padding: 2px 4px;
        }
        .y2k-start {
          display: flex; align-items: center; gap: 4px;
          font-weight: bold; font-size: 11px;
          padding: 2px 6px;
          border: 2px solid; border-color: #fff #808080 #808080 #fff;
          background: #c0c0c0; color: #000; cursor: pointer;
        }
        .y2k-start:active { border-color: #808080 #fff #fff #808080; }
        .y2k-flag { color: #008080; font-size: 14px; line-height: 1; }
        .y2k-task {
          flex: 1; font-family: inherit; font-size: 11px;
          padding: 2px 6px;
          border: 1px solid; border-color: #fff #808080 #808080 #fff;
          background: #c0c0c0; color: #000; cursor: pointer; text-align: left;
        }
        .y2k-task.active { background: #d4d4d4; border-color: #808080 #fff #fff #808080; }
        .y2k-task:hover:not(.active) { background: #d4d4d4; }
        .y2k-tray { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid; border-color: #808080 #fff #fff #808080; font-size: 11px; color: #000; }
      `}</style>

      <div className="fr-frame fr-frame-y2k" data-screen-label="05 Y2K">
        <div className="y2k-desktop">
          <div className="y2k-icon">
            <div className="y2k-iconart">📻</div>
            <div className="y2k-iconlabel">FakeRadio</div>
          </div>
          <div className="y2k-icon">
            <div className="y2k-iconart">💌</div>
            <div className="y2k-iconlabel">DJ Chat</div>
          </div>
          <div className="y2k-icon">
            <div className="y2k-iconart">🗑</div>
            <div className="y2k-iconlabel">Recycle</div>
          </div>
        </div>

        <Win title="🎵 FakeRadio Player.exe" x={18} y={20} w={290} h={300} z={zPlayer} onFocus={focusPlayer} accent="#000080">
          <div className="y2k-player">
            <div className="y2k-screen">
              <div className="y2k-vu">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className={"y2k-vubar " + (playing && i <= Math.floor(Math.abs(Math.sin(Date.now() / 200 + i)) * 12) ? "on" : "")} />
                ))}
              </div>
              <div className="y2k-track">
                <div className="y2k-marquee">
                  <div>♪ {track.title} — {track.artist}　　　　♪ {track.title} — {track.artist}</div>
                </div>
              </div>
              <div className="y2k-album">『{track.album}』</div>
            </div>
            <div className="y2k-progress" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}>
              <div className="y2k-pblocks">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} className={"y2k-pblock " + (i / 24 < pct ? "on" : "")} />
                ))}
              </div>
            </div>
            <div className="y2k-times">
              <span>{fmt(pos)}</span>
              <span>{fmt(track.dur)}</span>
            </div>
            <div className="y2k-ctrls">
              <button className="y2k-btn" onClick={() => skip(-1)}>◄◄</button>
              <button className="y2k-btn" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
              <button className="y2k-btn" onClick={() => skip(1)}>►►</button>
              <button className={"y2k-btn " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>{liked[track.id] ? "♥" : "♡"}</button>
            </div>
            <div className="y2k-vol">
              <label>VOL</label>
              <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
              <span className="y2k-mood">{mood}</span>
            </div>
          </div>
        </Win>

        <Win title={`💬 ${handle} - Conversation`} x={48} y={195} w={300} h={360} z={zChat} onFocus={focusChat} accent="#5b3ea0">
          <div className="y2k-chat">
            <div className="y2k-chat-hdr">
              <button type="button" className="y2k-avbtn" onClick={onAvatarClick}>
                {avatarSrc ? (
                  <img src={avatarSrc} className="y2k-avimg" alt="dj" />
                ) : (
                  <span className="y2k-avemoji">🌙</span>
                )}
              </button>
              <div>
                <div className="y2k-chat-name">{persona.name} - {handle}</div>
                <div className="y2k-chat-status">{busy ? "正在输入..." : "在线"}</div>
              </div>
            </div>
            <div className="y2k-chat-body" ref={scrollRef}>
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={"y2k-msg " + (isUser ? "u" : "a")}
                    onContextMenu={(e) => { e.preventDefault(); onBubbleAction("fav", m); }}
                    onDoubleClick={() => onBubbleAction("fav", m)}
                  >
                    <div className="y2k-msg-name">{isUser ? "你说:" : `${handle} 说:`}</div>
                    <div className={"y2k-msg-text" + (m.fav ? " fav" : "")}>
                      {m.text}
                      {m.streaming && <span className="y2k-caret">▌</span>}
                      {m.fav && " ★"}
                    </div>
                  </div>
                );
              })}
              {busy && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="y2k-msg a">
                  <div className="y2k-msg-name">{handle} 说:</div>
                  <div className="y2k-msg-text">…</div>
                </div>
              )}
            </div>
            <div className="y2k-chips">
              {QUICK_PROMPTS.map((q, i) => (
                <button key={i} className="y2k-chip" onClick={() => r.ask(q.prompt)} disabled={busy}>{q.label}</button>
              ))}
            </div>
            <form className="y2k-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "DJ 正在输入..." : "Type a message"}
                disabled={busy}
              />
              <button type="submit" className="y2k-send" disabled={busy || !input.trim()}>Send</button>
            </form>
          </div>
        </Win>

        <div className="y2k-taskbar">
          <button className="y2k-start">
            <span className="y2k-flag">▮</span> Start
          </button>
          <button className={"y2k-task " + (zPlayer > zChat ? "active" : "")} onClick={focusPlayer}>
            🎵 FakeRadio
          </button>
          <button className={"y2k-task " + (zChat > zPlayer ? "active" : "")} onClick={focusChat}>
            💬 {handle}
          </button>
          <div className="y2k-tray">
            <span>♪</span>
            <span>{time.getHours().toString().padStart(2, "0")}:{time.getMinutes().toString().padStart(2, "0")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
