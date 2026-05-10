// Skin: amber (vintage film radio) — original design
const SkinAmber = (() => {
  const { useRef, useState } = React;
  function Bubble({ msg, onAction, avatarSrc, onAvatarClick }) {
    const ref = useRef(null);
    const [menu, setMenu] = useState(false);
    const t = useRef(null);
    const start = () => { t.current = setTimeout(() => setMenu(true), 480); };
    const cancel = () => clearTimeout(t.current);
    const isUser = msg.role === "user";
    return (
      <div className={"bubble-row " + (isUser ? "u" : "a")}>
        {!isUser && (
          <button type="button" onClick={onAvatarClick} title="点击上传照片做 DJ 头像"
            style={{ appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer", borderRadius: "50%", display: "inline-flex" }}>
            {avatarSrc
              ? <img className="dj-avatar" src={avatarSrc} alt="dj" />
              : <WaveAvatar active={msg.streaming} size={28} />}
          </button>
        )}
        <div className="bubble-wrap">
          <div ref={ref}
            className={"bubble " + (isUser ? "u" : "a") + (msg.fav ? " fav" : "")}
            onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
            onTouchStart={start} onTouchEnd={cancel}
            onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}>
            {msg.text}
            {msg.streaming && <span className="caret" />}
            {msg.trackChip && (
              <div className="chip-track">
                <span className="dot" /> 正在播 · {msg.trackChip.title} — {msg.trackChip.artist}
              </div>
            )}
            {msg.fav && <div className="fav-mark">★ 已收藏</div>}
          </div>
          {menu && (
            <div className="bub-menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { onAction("fav", msg); setMenu(false); }}>{msg.fav ? "取消收藏" : "收藏这条"}</button>
              <button onClick={() => { onAction("more", msg); setMenu(false); }}>多说点</button>
              <button onClick={() => { onAction("less", msg); setMenu(false); }}>太长了</button>
              <button onClick={() => { onAction("copy", msg); setMenu(false); }}>复制</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return function SkinAmberView({ r, persona, avatarSrc, onAvatarClick }) {
    const { track, playing, pos, vol, liked, mood, setVol, togglePlay, skip, seek, toggleLike,
      messages, input, busy, setInput, send, onChip, onBubbleAction } = r;
    const scrollRef = useRef(null);
    React.useEffect(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);
    return (
      <div className="frame frame-amber" data-screen-label="01 Amber">
        <section className="player">
          <div className="player-bg" aria-hidden>
            <CoverArt track={track} playing={playing} />
            <div className="player-veil" />
            <div className="player-grain" />
          </div>
          <div className="player-fg">
            <div className="player-top">
              <div className="badge"><span className="led" /> FAKERADIO</div>
            </div>
            <div className="player-mid">
              <div className="cover-mini"><CoverArt track={track} playing={playing} /></div>
              <div className="meta">
                <div className="title">{track.title}</div>
                <div className="artist">{track.artist} · {track.album}</div>
              </div>
            </div>
            <div className="progress" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}>
              <div className="bar"><div className="fill" style={{ width: pos / track.dur * 100 + "%" }} /></div>
              <div className="times"><span>{fmt(pos)}</span><span>{fmt(track.dur)}</span></div>
            </div>
            <div className="controls">
              <button className={"ctl heart " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>{liked[track.id] ? "♥" : "♡"}</button>
              <button className="ctl" onClick={() => skip(-1)}>⏮</button>
              <button className="ctl big" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
              <button className="ctl" onClick={() => skip(1)}>⏭</button>
              <div className="vol">
                <span>♪</span>
                <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
              </div>
            </div>
          </div>
        </section>

        <section className="chat">
          <div className="chat-tape">
            <span className="tape-led" />
            <span className="tape-mood">{mood} · {persona.tag.split(" · ")[1]}</span>
            <span className="tape-status">{busy ? "SYNTHESIZING…" : "ON AIR"}</span>
          </div>
          <div className="chat-body" ref={scrollRef}>
            {messages.map((m) => <Bubble key={m.id} msg={m} onAction={onBubbleAction} avatarSrc={avatarSrc} onAvatarClick={onAvatarClick} />)}
            {busy && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="typing"><span /><span /><span /></div>
            )}
          </div>
          <div className="chips">
            {QUICK.map((q, i) => <button key={i} className="chip" onClick={() => onChip(q)} disabled={busy}>{q.label}</button>)}
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={busy ? "DJ 正在说话…" : "对 DJ 说点什么"} disabled={busy} />
            <button type="submit" className="send" disabled={busy || !input.trim()}>发送</button>
          </form>
        </section>

        <div className="frame-grain" aria-hidden />
        <div className="frame-vignette" aria-hidden />
        <div className="frame-scan" aria-hidden />
      </div>
    );
  };
})();
window.SkinAmber = SkinAmber;
