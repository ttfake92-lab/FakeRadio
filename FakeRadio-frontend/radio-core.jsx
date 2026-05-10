// FakeRadio core — shared data + useRadio hook + reusable atoms.
// Each skin file consumes useRadio() and renders its own UI.

const { useState, useEffect, useRef, useCallback } = React;

const PERSONAS = {
  midnight: {
    name: "深夜电台", short: "阿夜",
    tag: "凌晨 02:14 · MIDNIGHT FM",
    sysPrompt: "你是一档深夜电台的 DJ，名字叫『阿夜』。说话低声、慢、留白多，常常半句话就停。会把当下的曲目、夜的温度、听众的情绪揉在一起讲。每次回复 1–3 句中文，不超过 60 字，不用列点，不用 emoji，不要写『主持人：』之类的前缀。",
    moodWords: ["夜行", "灯关一半", "潮汐", "尾气", "凌晨蓝"]
  },
  morning: {
    name: "清晨陪伴", short: "晓",
    tag: "早上 07:02 · DAYBREAK FM",
    sysPrompt: "你是一档清晨电台的 DJ，名字叫『晓』。语气温柔、明亮、轻快，像把一杯热的递过来。每次 1–3 句中文，不超过 60 字，不用列点，不用 emoji。",
    moodWords: ["晨雾", "热豆浆", "通勤", "薄阳", "刚睁眼"]
  },
  buddy: {
    name: "话痨好友", short: "搭子",
    tag: "下午 03:48 · LIVING ROOM",
    sysPrompt: "你是听众的好友，碎碎念地聊天，像在对方客厅里。语气松、口语、可以自嘲。每次 1–3 句中文，不超过 70 字，不要 emoji，不要前缀。",
    moodWords: ["午后犯困", "沙发塌陷", "外卖刚到", "随便聊", "懒"]
  },
  cool: {
    name: "极简冷淡", short: "STATIC",
    tag: "深夜 23:58 · STATIC",
    sysPrompt: "你是一档极简电台的 DJ。一两句话即可，冷淡、克制、留白。中文，不超过 30 字，不用 emoji，不要前缀。",
    moodWords: ["低噪", "极简", "白光", "无人", "电流"]
  }
};

const TRACKS = [
  { id: "t1", title: "夜车", artist: "陈粒", album: "如也", dur: 218, source: "netease", tone: ["#3a2618", "#a4543a", "#f0c89b"] },
  { id: "t2", title: "晚安", artist: "蒋先贵", album: "三七地铁", dur: 246, source: "netease", tone: ["#1f1c2e", "#7a5fa3", "#e8c8b0"] },
  { id: "t3", title: "我的小水缸", artist: "尧十三", album: "飞船,宇航员", dur: 264, source: "netease", tone: ["#2a1818", "#c9603a", "#f5d3a3"] },
  { id: "t4", title: "南山南", artist: "马頔", album: "孤岛", dur: 311, source: "mock", tone: ["#1c2014", "#587a3a", "#dcd3a4"] },
  { id: "t5", title: "理想三旬", artist: "陈鸿宇", album: "浓烟下的诗歌电台", dur: 286, source: "netease", tone: ["#221a14", "#9c6a3a", "#f0d6a8"] }
];

const QUICK = [
  { label: "换一首", prompt: "帮我换一首,差不多的氛围就行。" },
  { label: "我想听安静的", prompt: "想听更安静的,不要鼓。" },
  { label: "降速", prompt: "我有点累了,节奏放慢点。" },
  { label: "讲讲这首", prompt: "讲讲这首歌的感觉。" },
  { label: "晚安", prompt: "我准备睡了,最后说点什么。" }
];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Vintage radial-gradient cover — used by amber + bento
function CoverArt({ track, playing }) {
  const [a, b, c] = track.tone;
  return (
    <div className="cover" aria-hidden>
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <radialGradient id={`g-${track.id}`} cx="35%" cy="30%" r="90%">
            <stop offset="0%" stopColor={c} />
            <stop offset="55%" stopColor={b} />
            <stop offset="100%" stopColor={a} />
          </radialGradient>
          <filter id={`n-${track.id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed={track.id.charCodeAt(1)} />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.32 0" />
          </filter>
        </defs>
        <rect width="200" height="200" fill={`url(#g-${track.id})`} />
        {[88, 76, 64, 52, 40, 28].map((r, i) =>
          <circle key={i} cx="100" cy="108" r={r} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        )}
        <circle cx="100" cy="108" r="14" fill={a} stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
        <circle cx="100" cy="108" r="2.2" fill={c} />
        <rect width="200" height="200" filter={`url(#n-${track.id})`} opacity="0.55" />
      </svg>
      <div className={"cover-spin " + (playing ? "on" : "")} />
    </div>
  );
}

function WaveAvatar({ active, size = 34, className = "wave" }) {
  const bars = 5;
  return (
    <div className={className} style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: bars }).map((_, i) =>
        <span key={i} className={active ? "on" : ""} style={{ animationDelay: `${i * 90}ms` }} />
      )}
    </div>
  );
}

// Master state hook — owns playback + chat + claude.
function useRadio(persona) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pos, setPos] = useState(38);
  const [vol, setVol] = useState(0.72);
  const [liked, setLiked] = useState({});
  const track = TRACKS[idx];
  const next = TRACKS[(idx + 1) % TRACKS.length];

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood] = useState(() => persona.moodWords[Math.floor(Math.random() * persona.moodWords.length)]);
  const seededFor = useRef(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPos((p) => {
      if (p + 1 >= track.dur) { setIdx((i) => (i + 1) % TRACKS.length); return 0; }
      return p + 1;
    }), 1000);
    return () => clearInterval(id);
  }, [playing, track.dur]);

  useEffect(() => {
    if (seededFor.current === persona.name) return;
    seededFor.current = persona.name;
    const greet = {
      "深夜电台": "夜里好。这首《" + track.title + "》是" + track.artist + "的,留给还没睡的人。",
      "清晨陪伴": "早。给你放《" + track.title + "》,慢慢醒。",
      "话痨好友": "嘿,你也在啊。我先放着《" + track.title + "》,你随便聊。",
      "极简冷淡": "在。播《" + track.title + "》。"
    }[persona.name] || "在听。";
    setMessages([{ id: "g" + Date.now(), role: "assistant", text: greet, trackChip: track }]);
    // eslint-disable-next-line
  }, [persona.name]);

  const ask = useCallback(async (userText, opts = {}) => {
    if (busy) return;
    const userMsg = { id: "u" + Date.now(), role: "user", text: userText };
    const aId = "a" + Date.now() + "x";
    const aMsg = { id: aId, role: "assistant", text: "", streaming: true };
    setMessages((m) => opts.silentUser ? [...m, aMsg] : [...m, userMsg, aMsg]);
    setBusy(true);
    const ctx = `[当前播放] ${track.title} — ${track.artist}(${track.album})\n[来源] ${track.source}\n[mood] ${mood}\n[时段] ${persona.tag}`;
    const system = persona.sysPrompt + "\n\n上下文:\n" + ctx;
    try {
      const reply = await window.claude.complete({
        messages: [{ role: "user", content: system + "\n\n听众说:" + userText + "\n\n请用 DJ 的口吻回 1–3 句中文,不要前缀,不要 emoji。" }]
      });
      const text = (reply || "").trim();
      let i = 0;
      const step = () => {
        i += Math.max(1, Math.floor(text.length / 40));
        setMessages((m) => m.map((x) => x.id === aId ? { ...x, text: text.slice(0, i), streaming: i < text.length } : x));
        if (i < text.length) setTimeout(step, 30); else setBusy(false);
      };
      step();
    } catch (e) {
      setMessages((m) => m.map((x) => x.id === aId ? { ...x, text: "(信号断了。再说一次?)", streaming: false } : x));
      setBusy(false);
    }
  }, [busy, track, mood, persona]);

  const send = (override) => {
    const v = (override !== undefined ? override : input).trim();
    if (!v) return;
    setInput("");
    ask(v);
  };
  const onChip = (q) => { setInput(""); ask(q.prompt); };
  const togglePlay = () => setPlaying((p) => !p);
  const skip = (d) => { setIdx((i) => (i + d + TRACKS.length) % TRACKS.length); setPos(0); };
  const seek = (p01) => setPos(Math.max(0, Math.min(track.dur - 1, Math.floor(p01 * track.dur))));
  const toggleLike = () => setLiked((l) => ({ ...l, [track.id]: !l[track.id] }));
  const onBubbleAction = (kind, msg) => {
    if (kind === "fav") setMessages((m) => m.map((x) => x.id === msg.id ? { ...x, fav: !x.fav } : x));
    else if (kind === "more") ask("刚才那段再展开点说。", { silentUser: true });
    else if (kind === "less") ask("太长了,给我一句话总结。", { silentUser: true });
    else if (kind === "copy") navigator.clipboard?.writeText(msg.text);
  };
  const seedReset = () => { seededFor.current = null; };

  return {
    track, next, playing, pos, vol, liked, mood,
    setVol, togglePlay, skip, seek, toggleLike,
    messages, input, busy, setInput, send, onChip, ask, onBubbleAction,
    seedReset
  };
}

Object.assign(window, { PERSONAS, TRACKS, QUICK, fmt, CoverArt, WaveAvatar, useRadio });
