/*
 * FakeRadio 离线 Demo · 交互逻辑
 * ------------------------------------------------------------------
 * 沙箱合规要点:
 *   - 无 fetch/XHR/WebSocket:节目数据来自 window.__EPISODE__(episode-data.js)
 *   - 无内联脚本、无 onclick 属性:全部事件用 addEventListener 绑定
 *   - 音频只用包内相对路径,不用 data:/blob:
 *   - EQ 默认纯 CSS 动画;WebAudio 真频谱作可选增强,失败静默回退
 */
(function () {
  "use strict";

  var DATA = window.__EPISODE__;
  var frame = document.getElementById("frame");
  var audio = document.getElementById("audio");

  // ---- DOM 缓存 ----
  var el = {
    clock: document.getElementById("clock"),
    dayName: document.getElementById("dayName"),
    dateStr: document.getElementById("dateStr"),
    trackTitle: document.getElementById("trackTitle"),
    trackArtist: document.getElementById("trackArtist"),
    chatLog: document.getElementById("chatLog"),
    progress: document.getElementById("progress"),
    progFill: document.getElementById("progFill"),
    progKnob: document.getElementById("progKnob"),
    progTime: document.getElementById("progTime"),
    btnPrev: document.getElementById("btnPrev"),
    btnPlay: document.getElementById("btnPlay"),
    btnNext: document.getElementById("btnNext"),
    iconPlay: document.getElementById("iconPlay"),
    iconPause: document.getElementById("iconPause"),
    btnDark: document.getElementById("btnDark"),
    btnLight: document.getElementById("btnLight"),
    vol: document.getElementById("vol"),
    brandLogo: document.getElementById("brandLogo")
  };

  // 数据缺失时降级,不抛异常
  if (!DATA || !DATA.tracks || !DATA.tracks.length) {
    if (el.chatLog) el.chatLog.textContent = "节目数据未能加载。";
    return;
  }
  var tracks = DATA.tracks;
  var djName = (DATA.dj && DATA.dj.name) ? DATA.dj.name : "AI HOST";
  // 顶栏 = FakeRadio 品牌头像(DATA.logo);缺图时回退到 DJ 头像,不破图。
  el.brandLogo.addEventListener("error", function () {
    if (DATA.dj && DATA.dj.avatar && el.brandLogo.getAttribute("src") !== DATA.dj.avatar) {
      el.brandLogo.src = DATA.dj.avatar;
    }
  });
  if (DATA.logo) el.brandLogo.src = DATA.logo;

  // ---- 状态 ----
  var state = {
    index: 0,
    playing: false,
    dragging: false,
    volume: 0.6 // 对应 5 格里的第 3 格
  };

  // ---------- 主题 ----------
  var SEG_ON = "font-size:9.5px;letter-spacing:1.5px;cursor:pointer;border:none;border-radius:14px;padding:5px 9px;background:var(--seg-bg);color:var(--ink);font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,.15);";
  var SEG_OFF = "font-size:9.5px;letter-spacing:1.5px;cursor:pointer;border:none;border-radius:14px;padding:5px 9px;background:transparent;color:var(--muted);font-weight:500;";
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    el.btnDark.setAttribute("style", t === "dark" ? SEG_ON : SEG_OFF);
    el.btnLight.setAttribute("style", t === "light" ? SEG_ON : SEG_OFF);
    try { localStorage.setItem("fr_theme", t); } catch (e) {}
  }
  var savedTheme = "light";
  try { savedTheme = localStorage.getItem("fr_theme") || "light"; } catch (e) {}
  setTheme(savedTheme === "dark" ? "dark" : "light");
  el.btnDark.addEventListener("click", function () { setTheme("dark"); });
  el.btnLight.addEventListener("click", function () { setTheme("light"); });

  // ---------- 时钟 ----------
  var DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function pad(n) { return String(n).padStart(2, "0"); }
  function renderClock() {
    var d = new Date();
    el.clock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
    el.dayName.textContent = DAYS[d.getDay()];
    el.dateStr.textContent = d.getDate() + " • " + MONS[d.getMonth()] + " • " + d.getFullYear();
  }
  renderClock();
  setInterval(renderClock, 15000);

  // ---------- 时间格式 ----------
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return pad(m) + ":" + pad(s);
  }

  // ---------- 曲目渲染 ----------
  function currentDuration() {
    if (isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return tracks[state.index].duration || 0;
  }
  function renderTrack() {
    var t = tracks[state.index];
    el.trackTitle.textContent = t.title;
    el.trackArtist.textContent = (t.artist || "").toUpperCase();
    renderProgress(0, currentDuration());
  }

  function scrollChatToBottom() {
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  // 文字流式打字机:逐字浮现 + 闪烁光标;切到下一条时上一条立即补全。
  var activeTyper = null;
  function finishActiveTyper() {
    if (!activeTyper) return;
    clearInterval(activeTyper.id);
    activeTyper.el.textContent = activeTyper.full;
    if (activeTyper.caret && activeTyper.caret.parentNode) {
      activeTyper.caret.parentNode.removeChild(activeTyper.caret);
    }
    activeTyper = null;
  }
  function typeInto(textEl, caret, full) {
    finishActiveTyper();
    textEl.textContent = "";
    var i = 0;
    var id = setInterval(function () {
      i += 1;
      textEl.textContent = full.slice(0, i);
      scrollChatToBottom();
      if (i >= full.length) {
        clearInterval(id);
        if (caret && caret.parentNode) caret.parentNode.removeChild(caret);
        if (activeTyper && activeTyper.id === id) activeTyper = null;
      }
    }, 38);
    activeTyper = { id: id, el: textEl, caret: caret, full: full };
  }

  // 每首歌的口播作为一条新气泡追加到对话流,往上累积(不替换、不消失)。
  var lastStoryNo = null;
  function appendStory(t) {
    if (t.no === lastStoryNo) return; // 避免同一首连续重复追加
    lastStoryNo = t.no;
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;animation:bubbleIn .4s cubic-bezier(.2,.8,.2,1) both;";
    var av = document.createElement("img");
    av.alt = djName;
    av.src = (DATA.dj && DATA.dj.avatar) ? DATA.dj.avatar : "";
    av.style.cssText = "width:34px;height:34px;border-radius:50%;border:1px solid var(--line);flex:none;object-fit:cover;";
    var bubble = document.createElement("div");
    bubble.style.cssText = "flex:1;min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--bubble);padding:12px 14px;font-family:'Courier Prime','Courier New',Courier,monospace;";
    var text = document.createElement("span");
    text.style.cssText = "font-size:13px;line-height:1.7;font-weight:700;color:var(--ink);word-break:break-word;";
    var caret = document.createElement("span");
    caret.className = "fr-caret";
    caret.textContent = "▍";
    var line = document.createElement("div");
    line.appendChild(text);
    line.appendChild(caret);
    var meta = document.createElement("div");
    meta.textContent = "[ " + djName + " ] · " + t.artist + " —《" + t.title + "》";
    meta.style.cssText = "font-size:9px;letter-spacing:1.2px;color:var(--muted);margin-top:12px;word-break:break-word;";
    bubble.appendChild(line);
    bubble.appendChild(meta);
    row.appendChild(av);
    row.appendChild(bubble);
    el.chatLog.appendChild(row);
    scrollChatToBottom();
    typeInto(text, caret, t.story || "");
  }
  function renderProgress(cur, dur) {
    var ratio = dur > 0 ? Math.min(1, cur / dur) : 0;
    var pct = (ratio * 100).toFixed(2) + "%";
    el.progFill.style.width = pct;
    el.progKnob.style.left = pct;
    el.progTime.style.left = pct;
    el.progTime.textContent = fmt(cur) + " / " + fmt(dur);
  }

  // ---------- 加载 / 播放 ----------
  function loadTrack(i, autoplay) {
    state.index = (i + tracks.length) % tracks.length;
    audio.src = tracks[state.index].file;
    audio.load();
    renderTrack();
    appendStory(tracks[state.index]);
    if (autoplay) play();
  }
  function reflectPlaying() {
    frame.setAttribute("data-playing", state.playing ? "1" : "0");
    el.iconPlay.style.display = state.playing ? "none" : "block";
    el.iconPause.style.display = state.playing ? "block" : "none";
  }
  function play() {
    resumeWebAudio();
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }
  function pause() { audio.pause(); }
  function toggle() { if (state.playing) pause(); else play(); }
  function next() { loadTrack(state.index + 1, true); }
  function prev() {
    // 播放超过 3 秒时,上一首=从头开始;否则跳到真正的上一首
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    loadTrack(state.index - 1, true);
  }

  audio.addEventListener("play", function () { state.playing = true; reflectPlaying(); });
  audio.addEventListener("pause", function () { state.playing = false; reflectPlaying(); });
  audio.addEventListener("ended", function () {
    if (state.index < tracks.length - 1) {
      next();
    } else {
      // 整期结束:停在最后一首开头,不循环
      state.playing = false; reflectPlaying();
      audio.currentTime = 0;
      renderProgress(0, currentDuration());
    }
  });
  audio.addEventListener("timeupdate", function () {
    if (!state.dragging) renderProgress(audio.currentTime, currentDuration());
  });
  audio.addEventListener("loadedmetadata", function () {
    if (!state.dragging) renderProgress(audio.currentTime, currentDuration());
  });

  el.btnPlay.addEventListener("click", toggle);
  el.btnNext.addEventListener("click", next);
  el.btnPrev.addEventListener("click", prev);

  // ---------- 进度条交互(点击 + 拖动) ----------
  function ratioFromEvent(e) {
    var r = el.progress.getBoundingClientRect();
    var x = (e.clientX != null ? e.clientX : 0) - r.left;
    return Math.max(0, Math.min(1, x / r.width));
  }
  function showKnob(on) {
    el.progKnob.style.opacity = on ? "1" : "0";
    el.progTime.style.opacity = on ? "1" : "0";
  }
  el.progress.addEventListener("pointerenter", function () { showKnob(true); });
  el.progress.addEventListener("pointerleave", function () { if (!state.dragging) showKnob(false); });
  el.progress.addEventListener("pointerdown", function (e) {
    state.dragging = true;
    showKnob(true);
    try { el.progress.setPointerCapture(e.pointerId); } catch (err) {}
    var dur = currentDuration();
    renderProgress(ratioFromEvent(e) * dur, dur);
  });
  el.progress.addEventListener("pointermove", function (e) {
    if (!state.dragging) return;
    var dur = currentDuration();
    renderProgress(ratioFromEvent(e) * dur, dur);
  });
  function endDrag(e) {
    if (!state.dragging) return;
    state.dragging = false;
    var dur = currentDuration();
    if (dur > 0) audio.currentTime = ratioFromEvent(e) * dur;
    showKnob(false);
  }
  el.progress.addEventListener("pointerup", endDrag);
  el.progress.addEventListener("pointercancel", endDrag);

  // ---------- 音量(5 格,点当前格=静音) ----------
  function applyVolume() {
    audio.volume = state.volume;
    var active = Math.round(state.volume * 5);
    var spans = el.vol.querySelectorAll("span");
    for (var i = 0; i < spans.length; i++) {
      spans[i].style.background = (i < active) ? "var(--ink)" : "var(--faint)";
    }
  }
  el.vol.addEventListener("click", function (e) {
    var span = e.target.closest ? e.target.closest("span[data-level]") : null;
    if (!span) return;
    var lvl = parseInt(span.getAttribute("data-level"), 10);
    var nextVol = lvl / 5;
    // 点击当前最高格 = 静音
    if (Math.round(state.volume * 5) === lvl) nextVol = 0;
    state.volume = nextVol;
    applyVolume();
  });

  // ---------- WebAudio 真频谱(可选增强,失败静默回退 CSS) ----------
  var wa = { ok: false, ctx: null, analyser: null, data: null, spans: null, raf: 0 };
  function initWebAudio() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      wa.ctx = new Ctx();
      var srcNode = wa.ctx.createMediaElementSource(audio);
      wa.analyser = wa.ctx.createAnalyser();
      wa.analyser.fftSize = 64;
      srcNode.connect(wa.analyser);
      wa.analyser.connect(wa.ctx.destination);
      wa.data = new Uint8Array(wa.analyser.frequencyBinCount);
      wa.spans = document.getElementById("eq").querySelectorAll("span");
      wa.ok = true;
      // 切到真频谱驱动:关掉 CSS 动画,靠 rAF 设 scaleY
      for (var i = 0; i < wa.spans.length; i++) wa.spans[i].style.animation = "none";
      tickWebAudio();
    } catch (e) {
      wa.ok = false; // 沙箱禁用或报错 => CSS 动画照常,声音不受影响
    }
  }
  function tickWebAudio() {
    if (!wa.ok) return;
    wa.raf = requestAnimationFrame(tickWebAudio);
    wa.analyser.getByteFrequencyData(wa.data);
    var bins = wa.data.length;
    for (var i = 0; i < wa.spans.length; i++) {
      var idx = 1 + Math.floor((i / wa.spans.length) * (bins - 2));
      var v = wa.data[idx] / 255;
      var scale = state.playing ? Math.max(0.22, v) : 0.28;
      wa.spans[i].style.transform = "scaleY(" + scale.toFixed(3) + ")";
    }
  }
  function resumeWebAudio() {
    if (wa.ok && wa.ctx && wa.ctx.state === "suspended") {
      try { wa.ctx.resume(); } catch (e) {}
    }
  }
  // WebAudio 需在用户手势内初始化(自动播放策略);首次点播放时建
  el.btnPlay.addEventListener("click", function initOnce() {
    initWebAudio();
    el.btnPlay.removeEventListener("click", initOnce);
  });

  // ---------- 鼠标跟随光晕(移动端无鼠标则静态,无害) ----------
  frame.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    var r = frame.getBoundingClientRect();
    frame.style.setProperty("--mx", (e.clientX - r.left) + "px");
    frame.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  // ---------- 启动 ----------
  applyVolume();
  loadTrack(0, false);
  reflectPlaying();
})();
