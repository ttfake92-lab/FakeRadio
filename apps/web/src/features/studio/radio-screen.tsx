'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@fakeradio/shared';
import type { AudioEngine } from '../player/use-audio-engine';

// ─────────────────────────────────────────────────────────────
// Audio-reactive EQ（5 根频谱柱，接真实 AnalyserNode）
// 同时分析音乐 + 口播两个元素：口播阶段音乐是暂停的，只看音乐会没有频谱，
// DJ 说话时柱子应跟着人声跳。没有真实数据时柱子静止，绝不放假动画。
// ─────────────────────────────────────────────────────────────
const EQ_BARS = 5;
const EMPTY_LEVELS = Array.from({ length: EQ_BARS }, () => 0);

type VisualizerGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
};

const visualizerGraphs = new WeakMap<HTMLMediaElement, VisualizerGraph>();

function getAudioContextCtor(): typeof AudioContext | null {
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

function getOrCreateVisualizerGraph(audio: HTMLMediaElement): VisualizerGraph | null {
  const existing = visualizerGraphs.get(audio);
  if (existing) return existing;

  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  try {
    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.minDecibels = -88;
    analyser.maxDecibels = -18;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(context.destination);

    const graph: VisualizerGraph = {
      context,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
    };
    visualizerGraphs.set(audio, graph);
    return graph;
  } catch {
    return null;
  }
}

function mapFrequencyDataToBars(data: Uint8Array<ArrayBuffer>): number[] {
  const usableBins = Math.max(1, Math.floor(data.length * 0.92));
  return Array.from({ length: EQ_BARS }, (_, index) => {
    const start = Math.floor((index / EQ_BARS) ** 1.35 * usableBins);
    const end = Math.max(start + 1, Math.floor(((index + 1) / EQ_BARS) ** 1.35 * usableBins));
    let peak = 0;
    for (let bin = start; bin < Math.min(end, data.length); bin += 1) {
      peak = Math.max(peak, data[bin] ?? 0);
    }
    const normalized = Math.min(1, peak / 255);
    return Math.min(1, normalized ** 0.72 * 1.38);
  });
}

function useAudioReactiveEq(
  musicRef: React.RefObject<HTMLAudioElement | null>,
  speechRef: React.RefObject<HTMLAudioElement | null>,
  active: boolean
): { levels: number[]; reactive: boolean; resume: () => void } {
  const [state, setState] = useState({ levels: EMPTY_LEVELS, reactive: false });

  const resume = useCallback(() => {
    if (typeof window === 'undefined') return;
    for (const ref of [musicRef, speechRef]) {
      const audio = ref.current;
      if (!audio) continue;
      const graph = getOrCreateVisualizerGraph(audio);
      graph?.context.resume().catch(() => {});
    }
  }, [musicRef, speechRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cleanups: Array<() => void> = [];
    for (const ref of [musicRef, speechRef]) {
      const audio = ref.current;
      if (!audio) continue;
      const wakeVisualizer = () => {
        const graph = getOrCreateVisualizerGraph(audio);
        graph?.context.resume().catch(() => {});
      };
      audio.addEventListener('play', wakeVisualizer);
      audio.addEventListener('playing', wakeVisualizer);
      cleanups.push(() => {
        audio.removeEventListener('play', wakeVisualizer);
        audio.removeEventListener('playing', wakeVisualizer);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [musicRef, speechRef]);

  useEffect(() => {
    if (!active) {
      setState((current) => (current.reactive ? { levels: EMPTY_LEVELS, reactive: false } : current));
      return;
    }
    if (typeof window === 'undefined') return;

    const sources = [musicRef.current, speechRef.current]
      .filter((audio): audio is HTMLAudioElement => audio !== null)
      .map((audio) => ({ audio, graph: getOrCreateVisualizerGraph(audio) }))
      .filter((s): s is { audio: HTMLAudioElement; graph: VisualizerGraph } => s.graph !== null);
    if (sources.length === 0) return;

    let cancelled = false;
    let frame = 0;
    let lastUpdate = 0;
    sources.forEach((s) => s.graph.context.resume().catch(() => {}));

    const tick = (now: number) => {
      if (cancelled) return;
      if (now - lastUpdate > 32) {
        lastUpdate = now;
        // reactive 只由"是否有元素在出声"决定，不看能量阈值：暂停恢复后头几帧能量低、
        // 或前奏/弱段时能量本就低，用阈值当开关会把真实频谱误判成"假"动效。
        let merged: number[] | null = null;
        for (const { audio, graph } of sources) {
          if (audio.paused || audio.ended) continue;
          graph.analyser.getByteFrequencyData(graph.data);
          const bars = mapFrequencyDataToBars(graph.data);
          merged = merged ? merged.map((v, i) => Math.max(v, bars[i] ?? 0)) : bars;
        }
        setState({
          levels: merged ?? EMPTY_LEVELS,
          reactive: merged !== null,
        });
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, musicRef, speechRef]);

  return { ...state, resume };
}

// ─────────────────────────────────────────────────────────────
// SingleLineMarquee — 超宽文本缓慢往返滚动，不超宽时静止
// ─────────────────────────────────────────────────────────────
function SingleLineMarquee({ text, style }: { text: string; style: React.CSSProperties }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const dist = inner.scrollWidth - outer.clientWidth;
      setOverflow(dist > 2 ? dist : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);

  const animated = overflow > 0;
  return (
    <div ref={outerRef} style={{ overflow: 'hidden', minWidth: 0 }}>
      <span
        ref={innerRef}
        style={{
          ...style,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          ...(animated
            ? ({
                animation: 'fr-marquee 16s ease-in-out infinite',
                '--marquee-distance': `-${overflow}px`,
              } as React.CSSProperties)
            : {}),
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RadioScreen — 手机框整体（全端统一布局）
// ─────────────────────────────────────────────────────────────
export type RadioView = 'main' | 'library' | 'settings';

export function RadioScreen({
  theme,
  onSetTheme,
  clock,
  isLive,
  track,
  progress,
  currentTime,
  durationSec,
  isPlaying,
  isLoading,
  error,
  isFavorited,
  onPlayPause,
  onNext,
  onToggleFavorite,
  musicRef,
  audio,
  queue,
  view,
  onNavigate,
  neteaseLoggedIn,
  onOpenNeteaseLogin,
  chatArea,
  inputArea,
  overlayArea,
}: {
  theme: 'light' | 'dark';
  onSetTheme: (theme: 'light' | 'dark') => void;
  clock: Date;
  isLive: boolean;
  track: Track | null;
  progress: number;
  currentTime: number;
  durationSec: number | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  isFavorited: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  musicRef: React.RefObject<HTMLAudioElement | null>;
  audio: AudioEngine;
  queue: Track[];
  view: RadioView;
  onNavigate: (view: RadioView) => void;
  neteaseLoggedIn: boolean;
  onOpenNeteaseLogin: () => void;
  chatArea: React.ReactNode;
  inputArea: React.ReactNode;
  overlayArea: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const eq = useAudioReactiveEq(musicRef, audio.speechRef, isPlaying);

  const handlePlayPause = useCallback(() => {
    eq.resume();
    onPlayPause();
  }, [eq, onPlayPause]);

  const handlePrev = useCallback(() => {
    // 没有"上一首"历史，prev = 回到本曲开头（广播电台语义）
    const music = musicRef.current;
    if (music) music.currentTime = 0;
  }, [musicRef]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--backdrop)',
        padding: 'max(0px, min(24px, calc((100vh - 812px) / 2)))',
      }}
    >
      <div
        data-theme={theme}
        onMouseMove={handleMove}
        style={
          {
            '--mx': '220px',
            '--my': '180px',
            width: 'min(440px, 100vw)',
            height: 'min(812px, 100dvh)',
            margin: '0 auto',
            background: 'var(--bg)',
            color: 'var(--ink)',
            borderRadius: 'min(28px, 4vw)',
            overflow: 'hidden',
            fontFamily: 'var(--font-mono)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--frame-border)',
            boxShadow: 'var(--frame-shadow)',
          } as React.CSSProperties
        }
      >
        {/* Ambient glows + grain */}
        <div style={{ position: 'absolute', left: '50%', top: '-14%', width: '130%', height: '55%', transform: 'translateX(-50%)', background: 'radial-gradient(50% 50% at 50% 50%,var(--glow1),transparent 68%)', pointerEvents: 'none', zIndex: 0, animation: 'breathe 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: '-16%', width: '140%', height: '55%', transform: 'translateX(-50%)', background: 'radial-gradient(50% 50% at 50% 50%,var(--glow2),transparent 68%)', pointerEvents: 'none', zIndex: 0, animation: 'breathe 11s ease-in-out infinite 2.4s' }} />
        <div style={{ position: 'absolute', left: 'var(--mx)', top: 'var(--my)', width: 380, height: 380, transform: 'translate(-50%,-50%)', background: 'radial-gradient(50% 50% at 50% 50%,var(--glowC),transparent 70%)', pointerEvents: 'none', zIndex: 0, transition: 'left .35s cubic-bezier(.2,.8,.2,1),top .35s cubic-bezier(.2,.8,.2,1)', animation: 'glowpulse 6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(var(--grain) 0.6px,transparent 0.6px)', backgroundSize: '22px 22px', opacity: 0.32, pointerEvents: 'none' }} />

        <Header
          theme={theme}
          onSetTheme={onSetTheme}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
        />

        {view === 'main' ? (
          <>
            <HeroClock clock={clock} isLive={isLive} />
            <PlayerSection
              track={track}
              progress={progress}
              currentTime={currentTime}
              durationSec={durationSec}
              isPlaying={isPlaying}
              isLoading={isLoading}
              error={error}
              isFavorited={isFavorited}
              eqLevels={eq.reactive ? eq.levels : null}
              onPlayPause={handlePlayPause}
              onPrev={handlePrev}
              onNext={onNext}
              onToggleFavorite={onToggleFavorite}
              audio={audio}
            />
            <QueueBar queue={queue} />
            {chatArea}
            {inputArea}
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
              <button
                onClick={() => onNavigate('main')}
                style={{ fontSize: 9.5, letterSpacing: '2.5px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                BACK
              </button>
              <span style={{ fontSize: 9.5, letterSpacing: '2.5px', marginLeft: 'auto', color: 'var(--muted)' }}>
                {view === 'library' ? 'LIBRARY' : 'SETTINGS'}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px' }}>
              {overlayArea}
            </div>
          </div>
        )}

        <Footer />

        {menuOpen && (
          <MenuDrawer
            onClose={() => setMenuOpen(false)}
            onNavigate={(v) => { setMenuOpen(false); onNavigate(v); }}
            neteaseLoggedIn={neteaseLoggedIn}
            onOpenNeteaseLogin={() => { setMenuOpen(false); onOpenNeteaseLogin(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function Header({
  theme,
  onSetTheme,
  menuOpen,
  onToggleMenu,
}: {
  theme: 'light' | 'dark';
  onSetTheme: (theme: 'light' | 'dark') => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const seg = (active: boolean): React.CSSProperties => ({
    fontFamily: 'inherit',
    fontSize: 9.5,
    letterSpacing: '1.5px',
    border: 'none',
    borderRadius: 14,
    padding: '5px 9px',
    ...(active
      ? { background: 'var(--seg-bg)', color: 'var(--ink)', fontWeight: 700, boxShadow: '0 1px 2px rgba(0,0,0,.15)' }
      : { background: 'transparent', color: 'var(--muted)', fontWeight: 500 }),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '19px 20px 16px', borderBottom: '1px solid var(--line)', position: 'relative', zIndex: 2 }}>
      <div
        style={{
          width: 36,
          height: 36,
          flex: 'none',
          border: '1px solid var(--line)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.5px',
        }}
      >
        FR
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.5px', lineHeight: 1 }}>FakeRadio</div>
        <div style={{ fontSize: 8.5, letterSpacing: '1.3px', color: 'var(--muted)', marginTop: 5 }}>[ LOCAL RADIO • 88.7 FM ]</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--seg-line)', borderRadius: 18, padding: 3, gap: 2, flex: 'none' }}>
        <button onClick={() => onSetTheme('dark')} style={seg(theme === 'dark')}>DARK</button>
        <button onClick={() => onSetTheme('light')} style={seg(theme === 'light')}>LIGHT</button>
      </div>
      <button
        aria-label="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
        style={{ flex: 'none', padding: 3, color: 'var(--ink)', display: 'flex' }}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HeroClock
// ─────────────────────────────────────────────────────────────
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const halftoneMask = (px: number, gap: number): React.CSSProperties => ({
  WebkitMaskImage: `repeating-linear-gradient(180deg,#000 0 ${px}px,transparent ${px}px ${gap}px)`,
  maskImage: `repeating-linear-gradient(180deg,#000 0 ${px}px,transparent ${px}px ${gap}px)`,
});

function HeroClock({ clock, isLive }: { clock: Date; isLive: boolean }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(clock.getHours())}:${pad(clock.getMinutes())}`;
  const dayName = DAYS[clock.getDay()];
  const dateStr = `${clock.getDate()} • ${MONS[clock.getMonth()]} • ${clock.getFullYear()}`;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 24px', borderBottom: '1px solid var(--line)', zIndex: 2 }}>
      {/* Halftone deco */}
      <div style={{ position: 'absolute', left: -26, bottom: 6, width: 112, height: 112, borderRadius: '50%', background: 'var(--deco)', zIndex: 0, ...halftoneMask(3, 7) }} />
      <div style={{ position: 'absolute', left: 0, bottom: 22, width: 180, height: 52, background: 'repeating-linear-gradient(180deg,var(--deco) 0 2px,transparent 2px 9px)', zIndex: 0 }} />
      <div style={{ position: 'absolute', right: 24, bottom: 2, width: 96, height: 96, borderRadius: '50%', background: 'var(--deco)', zIndex: 0, ...halftoneMask(2, 8) }} />
      <div style={{ position: 'absolute', right: -30, bottom: 10, width: 96, height: 96, borderRadius: '50%', background: 'var(--deco)', zIndex: 0, ...halftoneMask(2, 8) }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 18, padding: '4px 12px', fontSize: 9, letterSpacing: '2.5px', background: 'var(--bg)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)', animation: isLive ? 'blinklive 2s steps(1) infinite' : 'none', opacity: isLive ? 1 : 0.3 }} />
          {isLive ? 'ON AIR' : 'STANDBY'}
        </div>
        <div
          suppressHydrationWarning
          style={{
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 0.92,
            letterSpacing: '1px',
            margin: '12px 0 4px',
            background: 'repeating-linear-gradient(180deg,var(--stripe) 0 3px,transparent 3px 6px)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {timeStr}
        </div>
        <div suppressHydrationWarning style={{ fontSize: 12, letterSpacing: '4px', fontWeight: 500, marginTop: 8 }}>{dayName}</div>
        <div suppressHydrationWarning style={{ fontSize: 9, letterSpacing: '3.5px', color: 'var(--muted)', marginTop: 9 }}>{dateStr}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PlayerSection — 进度条 + EQ + 曲目 + 控制键 + 音量
// ─────────────────────────────────────────────────────────────
function fmtPlayerTime(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const CIRCLE_BUTTON: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: '50%',
  color: 'var(--ink)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function PlayerSection({
  track,
  progress,
  currentTime,
  durationSec,
  isPlaying,
  isLoading,
  error,
  isFavorited,
  eqLevels,
  onPlayPause,
  onPrev,
  onNext,
  onToggleFavorite,
  audio,
}: {
  track: Track | null;
  progress: number;
  currentTime: number;
  durationSec: number | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  isFavorited: boolean;
  eqLevels: number[] | null;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  audio: AudioEngine;
}) {
  const [progHover, setProgHover] = useState(false);
  const pct = `${Math.min(Math.max(progress, 0), 1) * 100}%`;

  // 只画真实频谱：有数据跟着数据跳，没数据静止在低位。不放假动画。
  const eqBarStyle = (index: number): React.CSSProperties => ({
    width: 2.5,
    height: '100%',
    background: 'var(--ink)',
    transformOrigin: 'bottom',
    ...(eqLevels
      ? { transform: `scaleY(${Math.max(0.12, eqLevels[index] ?? 0)})`, transition: 'transform 60ms linear' }
      : { transform: 'scaleY(0.28)', transition: 'transform 200ms ease' }),
  });

  return (
    <div style={{ padding: '0 20px 18px', borderBottom: '1px solid var(--line)', position: 'relative', zIndex: 2 }}>
      {/* Progress */}
      <div
        onMouseEnter={() => setProgHover(true)}
        onMouseLeave={() => setProgHover(false)}
        style={{ position: 'relative', height: progHover ? 4 : 1, background: 'var(--muted)', margin: '0 -20px', cursor: 'default', transition: 'height .18s ease' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pct, background: 'var(--ink)' }} />
        <div style={{ position: 'absolute', left: pct, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)', border: '2px solid var(--ink)', boxShadow: '0 0 0 2px var(--bg)', opacity: progHover ? 1 : 0, transition: 'opacity .18s ease' }} />
        <div style={{ position: 'absolute', left: pct, bottom: 11, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.5px', color: 'var(--ink)', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: progHover ? 1 : 0, transition: 'opacity .18s ease' }}>
          {fmtPlayerTime(currentTime)}&nbsp;/&nbsp;{fmtPlayerTime(durationSec)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 15 }}>
        {/* EQ + track */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16, flex: 'none' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={eqBarStyle(i)} />
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <SingleLineMarquee
              text={track?.title ?? '—'}
              style={{ fontFamily: 'var(--font-courier)', fontSize: 12, fontWeight: 700, lineHeight: 1 }}
            />
            <div style={{ fontSize: 8.5, letterSpacing: '1.5px', color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              {track?.artist ?? '—'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button aria-label="prev" onClick={onPrev} style={{ ...CIRCLE_BUTTON, width: 24, height: 24 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6v12h2V6zm12 0-8 6 8 6z" /></svg>
            </button>
            <button
              aria-label={isPlaying ? 'pause' : 'play'}
              onClick={onPlayPause}
              disabled={isLoading}
              style={{ ...CIRCLE_BUTTON, width: 30, height: 30, opacity: isLoading ? 0.55 : 1 }}
            >
              {isLoading ? (
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--muted)', borderTopColor: 'var(--ink)', animation: 'fr-spin 0.9s linear infinite' }} />
              ) : isPlaying ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h4v14H8zm8 0h-4v14h4z" /></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button aria-label="next" onClick={onNext} style={{ ...CIRCLE_BUTTON, width: 24, height: 24 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17 6v12h-2V6zM5 6l8 6-8 6z" /></svg>
            </button>
            <button aria-label={isFavorited ? '取消收藏' : '收藏'} onClick={onToggleFavorite} style={{ ...CIRCLE_BUTTON, width: 24, height: 24 }}>
              {isFavorited ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 7.5 4 4 0 0 1 19 10.7C19 15.6 12 20 12 20z" /></svg>
              )}
            </button>
          </div>
          <VolumeBars audio={audio} />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 9.5, color: 'var(--danger)', marginTop: 8, lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VolumeBars — 5 格音量（点第 N 格 = N/5 音量）
// ─────────────────────────────────────────────────────────────
function VolumeBars({ audio }: { audio: AudioEngine }) {
  const [volume, setVolume] = useState(1);
  const activeBars = Math.round(volume * 5);

  const setLevel = useCallback((bars: number) => {
    // 点当前档位 = 静音切换（0），否则设为该档位
    const next = bars === activeBars ? 0 : bars / 5;
    setVolume(next);
    // 走 AudioEngine 统一设置：跨曲目/跨音乐与口播都生效，不会被 crossfade fade 覆盖。
    audio.setUserVolume(next);
    if (audio.musicRef.current) audio.musicRef.current.muted = next === 0;
    if (audio.speechRef.current) audio.speechRef.current.muted = next === 0;
  }, [audio, activeBars]);

  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 8, letterSpacing: '2px', color: 'var(--muted)', marginBottom: 5 }}>VOL</div>
      <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', justifyContent: 'flex-end' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-label={`音量 ${n}/5`}
            onClick={() => setLevel(n)}
            style={{
              width: 8,
              height: 4,
              padding: 0,
              background: n <= activeBars ? 'var(--ink)' : 'var(--faint)',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QueueBar — 可展开的待播队列
// ─────────────────────────────────────────────────────────────
function QueueBar({ queue }: { queue: Track[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--line)', position: 'relative', zIndex: 2 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '13px 20px', fontSize: 9.5, letterSpacing: '2.5px', color: 'var(--ink)' }}
      >
        <span>QUEUE</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
          {queue.length} {queue.length === 1 ? 'TRACK' : 'TRACKS'}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}
          >
            <path d="M6 14l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '0 20px 12px', maxHeight: 150, overflow: 'auto' }}>
          {queue.length === 0 ? (
            <div style={{ fontSize: 9.5, letterSpacing: '1.5px', color: 'var(--muted)' }}>NO UPCOMING TRACKS — DJ 会接着选</div>
          ) : (
            queue.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0' }}>
                <span style={{ fontSize: 9, color: 'var(--muted)', flex: 'none' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--font-courier)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                <span style={{ fontSize: 8.5, letterSpacing: '1px', color: 'var(--muted)', flex: 'none', textTransform: 'uppercase' }}>{t.artist}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MenuDrawer — 右上角菜单（节目库 / 设置 / 网易云）
// ─────────────────────────────────────────────────────────────
function MenuDrawer({
  onClose,
  onNavigate,
  neteaseLoggedIn,
  onOpenNeteaseLogin,
}: {
  onClose: () => void;
  onNavigate: (view: RadioView) => void;
  neteaseLoggedIn: boolean;
  onOpenNeteaseLogin: () => void;
}) {
  const item: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '11px 14px',
    fontSize: 11,
    letterSpacing: '1px',
    color: 'var(--ink)',
    borderRadius: 10,
    textAlign: 'left',
  };
  const sub: React.CSSProperties = { fontSize: 8.5, letterSpacing: '1.5px', color: 'var(--muted)' };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 64,
          right: 14,
          width: 210,
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: '0 18px 44px -12px rgba(0,0,0,.4)',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <button style={item} onClick={() => onNavigate('library')}>
          节目库 <span style={sub}>LIBRARY</span>
        </button>
        <button style={item} onClick={() => onNavigate('settings')}>
          设置 <span style={sub}>SETTINGS</span>
        </button>
        <div style={{ height: 1, background: 'var(--line)', margin: '4px 8px' }} />
        <button style={item} onClick={onOpenNeteaseLogin}>
          网易云登录
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, ...sub }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: neteaseLoggedIn ? '#4ade80' : 'var(--faint)' }} />
            {neteaseLoggedIn ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '7px 18px', position: 'relative', zIndex: 2, color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>
      <span style={{ letterSpacing: '1px', opacity: 0.6, fontSize: 9 }}>||||||||</span>
      <span style={{ fontSize: 7.5, letterSpacing: '2px' }}>鱼亦乐</span>
      <span style={{ letterSpacing: '1px', opacity: 0.6, fontSize: 9 }}>||||||||</span>
    </div>
  );
}
