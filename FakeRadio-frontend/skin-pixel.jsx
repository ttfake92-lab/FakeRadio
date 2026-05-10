// Skin: pixel — 4-color Game Boy LCD radio cart
const SkinPixel = (() => {
  const { useRef, useEffect, useState } = React;

  // Tiny 16x16 dithered cover derived from track tone; rendered upscaled with crisp pixels.
  function PxCover({ track, size = 96, playing }) {
    const ref = useRef(null);
    useEffect(() => {
      const cv = ref.current; if (!cv) return;
      const W = 16; cv.width = W; cv.height = W;
      const ctx = cv.getContext("2d");
      // 4-tone GB palette (mapped from track id seed)
      const palette = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"];
      const seed = track.id.charCodeAt(1) * 91 + track.id.charCodeAt(0);
      const rnd = (n) => Math.abs(Math.sin(seed + n * 12.9898)) * 43758.5453 % 1;
      // gradient + dither
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x - 6, dy = y - 6;
        const d = Math.sqrt(dx * dx + dy * dy) / 8;
        const noise = (rnd(x * 31 + y) - 0.5) * 0.25;
        const t = Math.min(1, Math.max(0, d + noise));
        const idx = t < 0.25 ? 3 : t < 0.55 ? 2 : t < 0.82 ? 1 : 0;
        ctx.fillStyle = palette[idx];
        ctx.fillRect(x, y, 1, 1);
      }
      // record hole + label dot
      ctx.fillStyle = palette[0]; ctx.fillRect(7, 7, 2, 2);
      ctx.fillStyle = palette[3]; ctx.fillRect(8, 8, 1, 1);
    }, [track.id]);
    return (
      <div className={"px-cover " + (playing ? "spin" : "")} style={{ width: size, height: size }}>
        <canvas ref={ref} style={{ width: size, height: size, imageRendering: "pixelated" }} />
      </div>
    );
  }

  function PxAvatar({ active, size = 24 }) {
    // 8x8 pixel face — 2 frames mouth animation
    const ref = useRef(null);
    const [frame, setFrame] = useState(0);
    useEffect(() => {
      if (!active) { setFrame(0); return; }
      const id = setInterval(() => setFrame((f) => (f + 1) % 2), 220);
      return () => clearInterval(id);
    }, [active]);
    useEffect(() => {
      const cv = ref.current; if (!cv) return;
      cv.width = 8; cv.height = 8;
      const ctx = cv.getContext("2d");
      const C = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"];
      const A = [
        // base face
        "33333333",
        "31111113",
        "11212121",
        "11111111",
        "11000011",
        "11" + (frame ? "1111" : "0220") + "11",
        "31111113",
        "33333333",
      ];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const c = parseInt(A[y][x] || "0", 10);
        ctx.fillStyle = C[c];
        ctx.fillRect(x, y, 1, 1);
      }
    }, [frame]);
    return <canvas ref={ref} style={{ width: size, height: size, imageRendering: "pixelated", display: "block" }} />;
  }

  function asciiBar(pct, len = 16) {
    const n = Math.round(pct * len);
    return "█".repeat(n) + "░".repeat(Math.max(0, len - n));
  }

  function PxBubble({ msg, isUser, avatarSrc, onAvatarClick, onLong }) {
    const t = useRef(null);
    const start = () => { t.current = setTimeout(() => onLong?.(msg), 480); };
    const cancel = () => clearTimeout(t.current);
    return (
      <div className={"px-row " + (isUser ? "u" : "a")}>
        {!isUser && (
          <button type="button" className="px-avbtn" onClick={onAvatarClick} title="点击上传照片">
            {avatarSrc
              ? <img src={avatarSrc} alt="dj" className="px-img-av" />
              : <PxAvatar active={msg.streaming} size={24} />}
          </button>
        )}
        <div className={"px-bubble " + (isUser ? "u" : "a") + (msg.fav ? " fav" : "")}
             onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
             onTouchStart={start} onTouchEnd={cancel}>
          <div className="px-tag">{isUser ? "▷ YOU" : "◁ DJ"}</div>
          <div className="px-text">
            {msg.text}
            {msg.streaming ? <span className="px-caret">▌</span> : <span className="px-done">▼</span>}
          </div>
          {msg.fav && <div className="px-fav">★ SAVED</div>}
        </div>
      </div>
    );
  }

  return function SkinPixelView({ r, persona, avatarSrc, onAvatarClick }) {
    const { track, playing, pos, liked, mood, togglePlay, skip, toggleLike,
      messages, input, busy, setInput, send, onChip, onBubbleAction } = r;
    const scrollRef = useRef(null);
    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
    const pct = pos / track.dur;
    return (
      <div className="frame frame-pixel" data-screen-label="01 Pixel">
        <section className="px-player">
          <div className="px-hdr">
            <span className="px-led on" />
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
          <div className="px-progress">
            <span className="px-time">{fmt(pos)}</span>
            <span className="px-bar">{asciiBar(pct)}</span>
            <span className="px-time">{fmt(track.dur)}</span>
          </div>
          <div className="px-ctrls">
            <button className={"px-btn heart " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>{liked[track.id] ? "♥" : "♡"}</button>
            <button className="px-btn" onClick={() => skip(-1)}>◀◀</button>
            <button className="px-btn primary" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
            <button className="px-btn" onClick={() => skip(1)}>▶▶</button>
            <div className="px-mood">MOOD: {mood.toUpperCase()}</div>
          </div>
        </section>

        <section className="px-chat">
          <div className="px-chat-hdr">
            <span>━━ DIALOG ━━</span>
            <span>{busy ? "SYNTHESIZING.." : "READY"}</span>
          </div>
          <div className="px-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <PxBubble key={m.id} msg={m} isUser={m.role === "user"}
                avatarSrc={avatarSrc} onAvatarClick={onAvatarClick}
                onLong={(mm) => onBubbleAction("fav", mm)} />
            ))}
            {busy && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="px-typing">. . .</div>
            )}
          </div>
          <div className="px-chips">
            {QUICK.map((q, i) => (
              <button key={i} className="px-chip" onClick={() => onChip(q)} disabled={busy}>
                ▸{q.label}
              </button>
            ))}
          </div>
          <form className="px-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <span className="px-prompt">&gt;</span>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "DJ TALKING.." : "TYPE A MESSAGE.."}
              disabled={busy} />
            <button type="submit" className="px-send" disabled={busy || !input.trim()}>SEND</button>
          </form>
        </section>
      </div>
    );
  };
})();
window.SkinPixel = SkinPixel;
