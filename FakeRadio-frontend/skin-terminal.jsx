// Skin: terminal — TUI / SSH-into-a-radio
const SkinTerminal = (() => {
  const { useRef, useEffect } = React;

  function asciiCover(track) {
    // 12x6 ASCII tile from track tone
    const seed = track.id.charCodeAt(1);
    const chars = [" ", ".", ":", "+", "*", "#", "@"];
    const W = 14, H = 7;
    const lines = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        const dx = x - W / 2, dy = (y - H / 2) * 1.6;
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

  function spectrum(playing, mood) {
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
    return out;
  }

  return function SkinTerminalView({ r, persona, avatarSrc, onAvatarClick }) {
    const { track, playing, pos, mood, togglePlay, skip,
      messages, input, busy, setInput, send, onChip, onBubbleAction, toggleLike, liked } = r;
    const scrollRef = useRef(null);
    const [, force] = React.useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 110); return () => clearInterval(id); }, []);
    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
    const pct = pos / track.dur;
    const handle = persona.short.toLowerCase() + "_fm";
    return (
      <div className="frame frame-term" data-screen-label="01 Terminal">
        <div className="term-titlebar">
          <span>● ● ●</span>
          <span className="term-title">user@fakeradio:~/{handle} — {fmt(pos)}/{fmt(track.dur)}</span>
          <span className="term-rec">REC</span>
        </div>
        <section className="term-player">
          <pre className="term-cover">{asciiCover(track)}</pre>
          <div className="term-meta">
            <div className="term-line"><span className="term-key">file</span> <span className="term-val">now_playing.mp3</span></div>
            <div className="term-line title">{track.title}</div>
            <div className="term-line"><span className="term-key">artist</span> {track.artist}</div>
            <div className="term-line"><span className="term-key">album</span> {track.album}</div>
            <div className="term-line"><span className="term-key">mood</span> <span className="term-mood">[{mood}]</span></div>
            <div className="term-spec">{spectrum(playing, mood)}</div>
          </div>
        </section>
        <div className="term-progress">
          <span>[</span>
          <span className="term-pbar">
            <span className="term-pfill" style={{ width: pct * 100 + "%" }} />
          </span>
          <span>]</span>
          <span className="term-pct">{Math.floor(pct * 100).toString().padStart(2, "0")}%</span>
        </div>
        <div className="term-ctrls">
          <button className="term-btn" onClick={() => skip(-1)}>[ &lt;&lt; prev ]</button>
          <button className="term-btn primary" onClick={togglePlay}>[ {playing ? "pause" : "play "} ]</button>
          <button className="term-btn" onClick={() => skip(1)}>[ next &gt;&gt; ]</button>
          <button className={"term-btn " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>[ {liked[track.id] ? "★" : "☆"} fav ]</button>
        </div>

        <section className="term-chat">
          <div className="term-chat-hdr">
            ── #midnight-fm ── {busy ? "buffering ..." : "idle"} ──
          </div>
          <div className="term-chat-body" ref={scrollRef}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              const speaker = isUser ? "you" : handle;
              return (
                <div key={m.id} className={"term-msg " + (isUser ? "u" : "a") + (m.fav ? " fav" : "")}
                     onContextMenu={(e) => { e.preventDefault(); onBubbleAction("fav", m); }}
                     onDoubleClick={() => onBubbleAction("fav", m)}>
                  <span className="term-speaker">
                    {!isUser && (
                      <button type="button" onClick={onAvatarClick} className="term-avbtn" title="点击上传 DJ 头像">
                        {avatarSrc
                          ? <img src={avatarSrc} className="term-avatar" alt="dj" />
                          : <span className="term-avtxt">▣</span>}
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
              <div className="term-msg a"><span className="term-speaker">&lt;{handle}&gt;</span><span className="term-msg-text">_</span></div>
            )}
          </div>
          <div className="term-chips">
            {[
              { label: "/skip", prompt: QUICK[0].prompt },
              { label: "/quiet", prompt: QUICK[1].prompt },
              { label: "/slow", prompt: QUICK[2].prompt },
              { label: "/about", prompt: QUICK[3].prompt },
              { label: "/goodnight", prompt: QUICK[4].prompt }
            ].map((q, i) => (
              <button key={i} className="term-chip" onClick={() => onChip(q)} disabled={busy}>{q.label}</button>
            ))}
          </div>
          <form className="term-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <span className="term-prompt">{handle}@fm:~$</span>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "[locked]" : "type and hit return…"} disabled={busy} />
            <span className="term-bcaret">{busy ? "" : "▌"}</span>
          </form>
        </section>
        <div className="term-scan" aria-hidden />
      </div>
    );
  };
})();
window.SkinTerminal = SkinTerminal;
