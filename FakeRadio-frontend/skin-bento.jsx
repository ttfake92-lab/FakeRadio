// Skin: bento — modern glass / Apple Music feel
const SkinBento = (() => {
  const { useRef, useEffect, useState } = React;

  function GlassBubble({ msg, isUser, avatarSrc, onAvatarClick, onAction }) {
    const [showReact, setShowReact] = useState(false);
    const t = useRef(null);
    const start = () => { t.current = setTimeout(() => setShowReact(true), 420); };
    const cancel = () => clearTimeout(t.current);
    return (
      <div className={"bn-row " + (isUser ? "u" : "a")}>
        {!isUser && (
          <button type="button" className="bn-avbtn" onClick={onAvatarClick}>
            {avatarSrc
              ? <img src={avatarSrc} className="bn-avatar" alt="dj" />
              : <WaveAvatar active={msg.streaming} size={30} className="bn-wave" />}
          </button>
        )}
        <div className="bn-bub-wrap">
          <div className={"bn-bubble " + (isUser ? "u" : "a") + (msg.fav ? " fav" : "")}
               onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
               onTouchStart={start} onTouchEnd={cancel}>
            {msg.text}
            {msg.streaming && <span className="bn-caret" />}
          </div>
          {msg.fav && <div className="bn-fav-pill">❤️ Saved</div>}
          {showReact && (
            <div className="bn-react" onMouseLeave={() => setShowReact(false)}>
              <button onClick={() => { onAction("fav", msg); setShowReact(false); }}>{msg.fav ? "♥" : "♡"}</button>
              <button onClick={() => { onAction("more", msg); setShowReact(false); }}>＋</button>
              <button onClick={() => { onAction("less", msg); setShowReact(false); }}>−</button>
              <button onClick={() => { onAction("copy", msg); setShowReact(false); }}>⎘</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return function SkinBentoView({ r, persona, avatarSrc, onAvatarClick }) {
    const { track, next, playing, pos, vol, liked, mood, setVol, togglePlay, skip, seek, toggleLike,
      messages, input, busy, setInput, send, onChip, onBubbleAction } = r;
    const [sheet, setSheet] = useState(false);
    const scrollRef = useRef(null);
    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, sheet]);
    const pct = pos / track.dur;
    const accent = track.tone[1];
    const bg = track.tone[0];

    return (
      <div className="frame frame-bento" data-screen-label="01 Bento" style={{ "--bn-accent": accent, "--bn-bg": bg, "--bn-tint": track.tone[2] }}>
        <div className="bn-blur-bg" aria-hidden>
          <CoverArt track={track} playing={playing} />
        </div>
        <div className="bn-blur-veil" aria-hidden />

        <div className={"bn-content " + (sheet ? "sheet-open" : "")}>
          <header className="bn-hdr">
            <div className="bn-now">NOW PLAYING</div>
            <div className="bn-mood">{persona.short} · {mood}</div>
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
              <button className={"bn-like " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>
                {liked[track.id] ? "♥" : "♡"} {liked[track.id] ? "Saved" : "Save"}
              </button>
            </div>
            <div className="bn-card bn-progress-card">
              <div className="bn-bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}>
                <div className="bn-bar-fill" style={{ width: pct * 100 + "%" }} />
                <div className="bn-bar-knob" style={{ left: pct * 100 + "%" }} />
              </div>
              <div className="bn-times"><span>{fmt(pos)}</span><span>−{fmt(track.dur - pos)}</span></div>
              <div className="bn-ctrls">
                <button className="bn-ctl" onClick={() => skip(-1)}>⏮</button>
                <button className="bn-ctl big" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
                <button className="bn-ctl" onClick={() => skip(1)}>⏭</button>
              </div>
              <div className="bn-vol">
                <span>♪</span>
                <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
              </div>
            </div>
            <div className="bn-card bn-next-card">
              <div className="bn-next-lbl">UP NEXT</div>
              <div className="bn-next-title">{next.title}</div>
              <div className="bn-next-artist">{next.artist}</div>
            </div>
          </div>

          <button className={"bn-sheet-handle " + (sheet ? "open" : "")} onClick={() => setSheet((s) => !s)}>
            <div className="bn-handle-bar" />
            <div className="bn-handle-label">
              {sheet ? "收起" : `与 ${persona.short} 聊聊`}
              {!sheet && messages.some((m) => !m.read) && <span className="bn-pip" />}
            </div>
          </button>

          <div className={"bn-sheet " + (sheet ? "open" : "")}>
            <div className="bn-sheet-hdr">
              <div className="bn-sheet-title">{persona.name} · {persona.short}</div>
              <div className="bn-sheet-sub">{busy ? "正在合成…" : "在线"}</div>
            </div>
            <div className="bn-sheet-body" ref={scrollRef}>
              {messages.map((m) => (
                <GlassBubble key={m.id} msg={m} isUser={m.role === "user"}
                  avatarSrc={avatarSrc} onAvatarClick={onAvatarClick} onAction={onBubbleAction} />
              ))}
              {busy && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="bn-typing"><span /><span /><span /></div>
              )}
            </div>
            <div className="bn-chips">
              {QUICK.map((q, i) => (
                <button key={i} className="bn-chip" onClick={() => onChip(q)} disabled={busy}>{q.label}</button>
              ))}
            </div>
            <form className="bn-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "DJ 正在说话…" : "iMessage"} disabled={busy} />
              <button type="submit" className="bn-send" disabled={busy || !input.trim()}>↑</button>
            </form>
          </div>
        </div>
      </div>
    );
  };
})();
window.SkinBento = SkinBento;
