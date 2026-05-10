// Skin: Y2K — Win98 desktop with two windows + taskbar
const SkinY2K = (() => {
  const { useRef, useEffect, useState } = React;

  function Win({ title, x, y, w, h, z, onFocus, children, accent = "#000080", onClose }) {
    const [pos, setPos] = useState({ x, y });
    const drag = useRef(null);
    const onDown = (e) => {
      onFocus?.();
      const sx = e.clientX, sy = e.clientY;
      const ox = pos.x, oy = pos.y;
      drag.current = (ev) => setPos({ x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) });
      const up = () => { window.removeEventListener("mousemove", drag.current); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", drag.current);
      window.addEventListener("mouseup", up);
    };
    return (
      <div className="y2k-win" style={{ left: pos.x, top: pos.y, width: w, height: h, zIndex: z, "--win-accent": accent }} onMouseDown={onFocus}>
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

  return function SkinY2KView({ r, persona, avatarSrc, onAvatarClick }) {
    const { track, playing, pos, vol, liked, mood, setVol, togglePlay, skip, seek, toggleLike,
      messages, input, busy, setInput, send, onChip, onBubbleAction } = r;
    const [zPlayer, setZPlayer] = useState(2);
    const [zChat, setZChat] = useState(1);
    const focusPlayer = () => { setZPlayer(2); setZChat(1); };
    const focusChat = () => { setZPlayer(1); setZChat(2); };
    const scrollRef = useRef(null);
    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
    const pct = pos / track.dur;
    const handle = persona.short || "DJ";
    const [time, setTime] = useState(() => new Date());
    useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

    return (
      <div className="frame frame-y2k" data-screen-label="01 Y2K">
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

        <Win title="🎵 FakeRadio Player.exe" x={18} y={20} w={290} h={300}
             z={zPlayer} onFocus={focusPlayer} accent="#000080">
          <div className="y2k-player">
            <div className="y2k-screen">
              <div className="y2k-vu">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className={"y2k-vubar " + (playing && i <= Math.floor(Math.abs(Math.sin(Date.now() / 200 + i)) * 12) ? "on" : "")} />
                ))}
              </div>
              <div className="y2k-track">
                <div className="y2k-marquee"><div>♪ {track.title} — {track.artist}　　　　♪ {track.title} — {track.artist}</div></div>
              </div>
              <div className="y2k-album">『{track.album}』</div>
            </div>
            <div className="y2k-progress" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}>
              <div className="y2k-pblocks">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} className={"y2k-pblock " + (i / 24 < pct ? "on" : "")} />
                ))}
              </div>
            </div>
            <div className="y2k-times"><span>{fmt(pos)}</span><span>{fmt(track.dur)}</span></div>
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

        <Win title={`💬 ${handle} - Conversation`} x={48} y={195} w={300} h={360}
             z={zChat} onFocus={focusChat} accent="#5b3ea0">
          <div className="y2k-chat">
            <div className="y2k-chat-hdr">
              <button type="button" className="y2k-avbtn" onClick={onAvatarClick}>
                {avatarSrc
                  ? <img src={avatarSrc} className="y2k-avimg" alt="dj" />
                  : <span className="y2k-avemoji">🌙</span>}
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
                       onDoubleClick={() => onBubbleAction("fav", m)}>
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
                <div className="y2k-msg a"><div className="y2k-msg-name">{handle} 说:</div><div className="y2k-msg-text">…</div></div>
              )}
            </div>
            <div className="y2k-chips">
              {QUICK.map((q, i) => (
                <button key={i} className="y2k-chip" onClick={() => onChip(q)} disabled={busy}>{q.label}</button>
              ))}
            </div>
            <form className="y2k-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "DJ 正在输入..." : "Type a message"} disabled={busy} />
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
    );
  };
})();
window.SkinY2K = SkinY2K;
