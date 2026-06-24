'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { NowResponse, Track, FavoriteTrack, ProgramBrief, ShowPlan, ShowJob, ShowProject, NeteaseLoginStatus, TasteResponse } from '@fakeradio/shared';
import {
  getNow,
  getShowProjects, generateNow,
  getFavorites, addFavorite, removeFavorite,
  getBriefs, getShowPlans, getShowJobs,
  getNeteaseLoginStatus, createNeteaseQrLogin, checkNeteaseQrLogin, submitNeteaseCookie,
  getTaste,
  insertNextTrack,
} from '../../lib/api-client';
import { useAudioEngine, type AudioEngine } from '../player/use-audio-engine';
import { usePlaybackState } from '../player/use-playback-state';
import { useStreamConnection } from '../player/use-stream-connection';
import type { AgentMessage } from '../player/use-stream-connection';
import { useChatSSE } from '../player/use-chat-sse';
import { QUICK_PROMPTS } from '../player/skin-config';
import { SettingsPanel } from '../show/settings-panel';
import { LibraryView } from '../show/library-view';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Theme = 'bone' | 'graphite';

interface ChatMessage {
  id: string;
  from: 'DJ' | 'YOU';
  text: string;
  streaming?: boolean;
  origin?: 'broadcast' | 'chat';
}

type VisualizerState = {
  levels: number[];
  energy: number;
  reactive: boolean;
};

type VisualizerGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
};

const VISUALIZER_BARS = 72;
const EMPTY_VISUALIZER_LEVELS = Array.from({ length: VISUALIZER_BARS }, () => 0);
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

function mapFrequencyDataToBars(data: Uint8Array<ArrayBuffer>): { levels: number[]; energy: number } {
  const usableBins = Math.max(1, Math.floor(data.length * 0.92));
  let energyTotal = 0;
  const levels = Array.from({ length: VISUALIZER_BARS }, (_, index) => {
    const start = Math.floor((index / VISUALIZER_BARS) ** 1.35 * usableBins);
    const end = Math.max(start + 1, Math.floor(((index + 1) / VISUALIZER_BARS) ** 1.35 * usableBins));
    let peak = 0;
    for (let bin = start; bin < Math.min(end, data.length); bin += 1) {
      peak = Math.max(peak, data[bin] ?? 0);
    }
    const normalized = Math.min(1, peak / 255);
    const shaped = Math.min(1, normalized ** 0.72 * 1.38);
    energyTotal += shaped;
    return shaped;
  });
  return { levels, energy: energyTotal / VISUALIZER_BARS };
}

function useAudioReactiveVisualizer(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  active: boolean
): VisualizerState & { resume: () => void } {
  const [state, setState] = useState<VisualizerState>({
    levels: EMPTY_VISUALIZER_LEVELS,
    energy: 0,
    reactive: false,
  });

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || typeof window === 'undefined') return;
    const graph = getOrCreateVisualizerGraph(audio);
    graph?.context.resume().catch(() => {});
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || typeof window === 'undefined') return;

    const wakeVisualizer = () => {
      const graph = getOrCreateVisualizerGraph(audio);
      graph?.context.resume().catch(() => {});
    };

    audio.addEventListener('play', wakeVisualizer);
    audio.addEventListener('playing', wakeVisualizer);
    return () => {
      audio.removeEventListener('play', wakeVisualizer);
      audio.removeEventListener('playing', wakeVisualizer);
    };
  }, [audioRef]);

  useEffect(() => {
    if (!active) {
      setState((current) => current.reactive ? { levels: EMPTY_VISUALIZER_LEVELS, energy: 0, reactive: false } : current);
      return;
    }

    const audio = audioRef.current;
    if (!audio || typeof window === 'undefined') return;

    const graph = getOrCreateVisualizerGraph(audio);
    if (!graph) return;

    let cancelled = false;
    let frame = 0;
    let lastUpdate = 0;
    graph.context.resume().catch(() => {});

    const tick = (now: number) => {
      if (cancelled) return;
      if (now - lastUpdate > 32) {
        lastUpdate = now;
        graph.analyser.getByteFrequencyData(graph.data);
        const next = mapFrequencyDataToBars(graph.data);
        // reactive 只由"是否在播"决定，不看能量阈值：暂停恢复后头几帧能量低、
        // 或前奏/弱段时能量本就低，用阈值当开关会把真实频谱误判成"假"动效。
        const audible = !audio.paused && !audio.ended;
        setState({
          levels: audible ? next.levels : EMPTY_VISUALIZER_LEVELS,
          energy: audible ? next.energy : 0,
          reactive: audible,
        });
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, audioRef]);

  return { ...state, resume };
}

// ─────────────────────────────────────────────────────────────
// Breakpoint hook
// ─────────────────────────────────────────────────────────────
type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('desktop');

  useEffect(() => {
    // iPad 竖屏(768) 与 iPhone 一并走 mobile 布局；≥1024（iPad 横屏/桌面）走 desktop。
    // tablet 区间保留以兼容类型，但不再被选中。
    const mobile = window.matchMedia('(max-width: 1023px)');
    const tablet = window.matchMedia('(min-width: 640px) and (max-width: 1023px)');
    const desktop = window.matchMedia('(min-width: 1024px)');

    const update = () => {
      if (mobile.matches) setBp('mobile');
      else if (tablet.matches) setBp('tablet');
      else setBp('desktop');
    };

    update();
    mobile.addEventListener('change', update);
    tablet.addEventListener('change', update);
    desktop.addEventListener('change', update);
    return () => {
      mobile.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
      desktop.removeEventListener('change', update);
    };
  }, []);

  return bp;
}

// ─────────────────────────────────────────────────────────────
// EditorialRadio — main page
// ─────────────────────────────────────────────────────────────
export function EditorialRadio() {
  const audio = useAudioEngine();
  const playback = usePlaybackState(audio);
  const bp = useBreakpoint();

  // Theme
  const [theme, setTheme] = useState<Theme>('bone');
  const [themeOverridden, setThemeOverridden] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('fakeradio.theme');
    if (stored === 'bone' || stored === 'graphite') {
      setTheme(stored);
      setThemeOverridden(true);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'graphite' : 'bone');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeOverridden(true);
    setTheme((t) => {
      const next = t === 'bone' ? 'graphite' : 'bone';
      localStorage.setItem('fakeradio.theme', next);
      return next;
    });
  }, []);

  // State
  const [now, setNow] = useState<NowResponse | null>(null);
  const [clock, setClock] = useState(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputDraft, setInputDraft] = useState('');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<Track[]>([]);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  // 记录最近一条进对话框的口播文案，去重避免同一首被 next/prefetch 重复广播刷屏。
  const lastBroadcastDjTextRef = useRef<string | null>(null);
  const chatSSE = useChatSSE();
  const [activeView, setActiveView] = useState<'main' | 'library' | 'settings'>('main');

  // Netease login + taste
  const [neteaseStatus, setNeteaseStatus] = useState<NeteaseLoginStatus | null>(null);
  const [showNeteaseLogin, setShowNeteaseLogin] = useState(false);
  const [taste, setTaste] = useState<TasteResponse | null>(null);
  const [showTaste, setShowTaste] = useState(false);

  // Production data
  const [briefs, setBriefs] = useState<ProgramBrief[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState<ShowPlan | null>(null);
  const [jobs, setJobs] = useState<ShowJob[]>([]);
  const [projects, setProjects] = useState<ShowProject[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioTimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 编排进度追踪：触发编排后轮询 job 状态，在聊天栏显示进程与 trace
  const [trackedJob, setTrackedJob] = useState<ShowJob | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopJobTracking = useCallback(() => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const startJobTracking = useCallback((briefId: string) => {
    stopJobTracking();
    setTrackedJob(null);
    let polls = 0;
    const poll = async () => {
      polls += 1;
      // 最多轮询 5 分钟，避免异常情况下无限轮询
      if (polls > 150) { stopJobTracking(); return; }
      try {
        const data = await getShowJobs(briefId);
        const jobs = data.jobs ?? [];
        if (jobs.length === 0) return;
        const latest = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!latest) return;
        setTrackedJob(latest);
        if (latest.status === 'completed' || latest.status === 'failed') {
          stopJobTracking();
        }
      } catch { /* 网络抖动时继续轮询 */ }
    };
    poll();
    jobPollRef.current = setInterval(poll, 2000);
  }, [stopJobTracking]);

  useEffect(() => stopJobTracking, [stopJobTracking]);

  // Extract data
  // 单一播放真相：episode 一旦加载，它就是"正在播放"的内容。
  // 显示（曲目/队列/DJ 文案）一律跟随 episode，避免与后台 now-playing 广播错位。
  const isEpisodeActive = playback.episodeData !== null;
  const episodeActiveRef = useRef(isEpisodeActive);
  episodeActiveRef.current = isEpisodeActive;

  const track = playback.episodeData?.track ?? now?.track ?? null;
  // UP NEXT 只在真正进入 episode 播放后显示已预取的下一首。
  // 之前 idle 状态下展示 now.queue（后端推荐缓冲池），但 PLAY 走的是
  // /api/episode/next 优先消费 priority slot / prepared episode / 现场生成，
  // 从不读 queue 头部——UI 显示的 3 首和实际播的不是一条线，点 PLAY 后就消失。
  const queue = isEpisodeActive
    ? (playback.nextEpisode ? [playback.nextEpisode.track] : [])
    : [];
  const baseDjSay = playback.episodeData?.story.text ?? now?.dj?.say ?? '';
  // DJ-speaking 区 = 当前曲目的口播介绍。聊天回复只进对话框，不抢这个槽——
  // 之前 chat reply 覆盖 baseDjSay 会让"音乐口播"和"用户对话回复"挤在同一格，
  // 用户分不清现在 DJ 说的到底是这首歌的介绍，还是在回复"我想听安静的"。
  const djSay = baseDjSay;
  const isLive = isEpisodeActive
    ? isPlaying
    : (now?.playback === 'playing' || isPlaying);
  const isFavorited = track ? favorites.some((f) => f.trackId === track.id) : false;
  const activeBrief = briefs.find((b) => b.id === activeBriefId) ?? null;
  const refreshProjects = useCallback(() => {
    getShowProjects().then((data) => setProjects(data.projects ?? [])).catch(() => {});
  }, []);
  const refreshProductionData = useCallback(async (preferredBriefId?: string | null) => {
    const [briefsData, projectsData] = await Promise.all([
      getBriefs().catch(() => ({ briefs: [] })),
      getShowProjects().catch(() => ({ projects: [] })),
    ]);
    const nextBriefs = briefsData.briefs ?? [];
    setBriefs(nextBriefs);
    setProjects(projectsData.projects ?? []);

    const nextActiveBriefId =
      preferredBriefId && nextBriefs.some((brief) => brief.id === preferredBriefId)
        ? preferredBriefId
        : activeBriefId && nextBriefs.some((brief) => brief.id === activeBriefId)
          ? activeBriefId
          : nextBriefs[0]?.id ?? null;

    setActiveBriefId(nextActiveBriefId);
    if (!nextActiveBriefId) {
      setShowPlan(null);
      setJobs([]);
      return;
    }

    const [plansData, jobsData] = await Promise.all([
      getShowPlans(nextActiveBriefId).catch(() => ({ plans: [] })),
      getShowJobs(nextActiveBriefId).catch(() => ({ jobs: [] })),
    ]);
    const plans = plansData.plans ?? [];
    setShowPlan(plans.find((plan) => plan.active) ?? plans[0] ?? null);
    setJobs(jobsData.jobs ?? []);
  }, [activeBriefId]);

  // DJ typewriter：只渲染当前曲目的介绍（baseDjSay），聊天回复走对话框。
  const djLines = useMemo(() => {
    if (baseDjSay) return [baseDjSay];
    return ['等待播放…'];
  }, [baseDjSay]);
  const [djLineIndex, setDjLineIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const displayTypedText = typedText;

  // 每次 episode 切换都把当前曲目的口播文案 push 进对话框，作为单一数据源。
  // 之前依赖后端 WebSocket 广播 dj-speech 来填对话框，但 prefetch 接续路径
  // (finalizePrefetchEpisode) 没广播，导致预取曲目切到时对话框收不到。
  // 直接以 episodeData.story.text 为权威，不再绕一圈走 WS。
  useEffect(() => {
    const story = playback.episodeData?.story.text?.trim();
    const trackId = playback.episodeData?.track.id;
    if (!story || !trackId) return;
    if (story === lastBroadcastDjTextRef.current) return;
    lastBroadcastDjTextRef.current = story;
    setMessages((prev) => [
      ...prev,
      { id: `dj-ep-${trackId}-${Date.now()}`, from: 'DJ', text: story, origin: 'broadcast' },
    ]);
  }, [playback.episodeData?.track.id, playback.episodeData?.story.text]);

  useEffect(() => {
    const full = djLines[djLineIndex] ?? '';
    let i = 0;
    setTypedText('');
    const t = setInterval(() => {
      i++;
      setTypedText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(t);
        setTimeout(
          () => setDjLineIndex((l) => (l + 1) % djLines.length),
          3200,
        );
      }
    }, 60);
    return () => clearInterval(t);
  }, [djLineIndex, djLines]);

  // WebSocket stream
  const { streamStatus } = useStreamConnection(
    audio,
    (nowPlaying) => {
      // 仅在非 episode 播放时收到（hook 已门控）。episode 播放时显示由 episodeData 单源驱动。
      setNow(nowPlaying);
      if (nowPlaying.playback === 'playing') setIsPlaying(true);
      if (nowPlaying.playback === 'idle') setIsPlaying(false);
    },
    (queue) => {
      setNow((prev) => (prev ? { ...prev, queue } : null));
    },
    (dj) => {
      setNow((prev) => (prev ? { ...prev, dj } : null));
      // 每首歌的介绍口播文案无条件进对话框（互动感）。
      // 之前用 episodeActiveRef 门控会因 setEpisodeData 与 dj-speech 广播的竞争
      // 把口播一起挡掉，导致文案时有时无。这里去掉门控，仅做去重防刷屏。
      if (dj.say && dj.say !== lastBroadcastDjTextRef.current) {
        lastBroadcastDjTextRef.current = dj.say;
        setMessages((prev) => [
          ...prev,
          { id: `dj-${Date.now()}`, from: 'DJ', text: dj.say, origin: 'broadcast' },
        ]);
      }
    },
    (msg) => {
      setAgentMessages((prev) => [...prev.slice(-19), msg]);
    },
    () => episodeActiveRef.current,
  );

  // Initial fetch
  useEffect(() => {
    getNow()
      .then((data) => setNow(data))
      .catch(() => {});
    getFavorites()
      .then((data) => setFavorites(data.favorites))
      .catch(() => {});
    getBriefs()
      .then((data) => {
        setBriefs(data.briefs ?? []);
        const firstBrief = data.briefs?.[0];
        if (firstBrief) setActiveBriefId(firstBrief.id);
      })
      .catch(() => {});
    getShowProjects()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {});
    getNeteaseLoginStatus()
      .then((data) => setNeteaseStatus(data))
      .catch(() => {});
    getTaste()
      .then((data) => setTaste(data))
      .catch(() => {});
  }, []);

  // Load plans and jobs when active brief changes
  useEffect(() => {
    if (!activeBriefId) { setShowPlan(null); setJobs([]); return; }
    getShowPlans(activeBriefId)
      .then((data) => {
        const plans = data.plans ?? [];
        setShowPlan(plans.find((p) => p.active) ?? plans[0] ?? null);
      })
      .catch(() => {});
    getShowJobs(activeBriefId)
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => {});
  }, [activeBriefId]);

  // Fallback polling
  useEffect(() => {
    if (streamStatus.label === '已连接') return;
    const id = setInterval(() => {
      getNow()
        .then((data) => setNow(data))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [streamStatus.label]);

  // Track audio time
  useEffect(() => {
    if (!isPlaying) return;
    audioTimeRef.current = setInterval(() => {
      const musicAudio = audio.musicRef.current;
      if (musicAudio) setCurrentTime(musicAudio.currentTime);
    }, 500);
    return () => {
      if (audioTimeRef.current) {
        clearInterval(audioTimeRef.current);
        audioTimeRef.current = null;
      }
    };
  }, [isPlaying, audio.musicRef]);

  useEffect(() => {
    const musicAudio = audio.musicRef.current;
    if (!musicAudio) return;
    const updateDuration = () => {
      setAudioDurationSec(Number.isFinite(musicAudio.duration) && musicAudio.duration > 0 ? musicAudio.duration : null);
    };
    musicAudio.addEventListener('loadedmetadata', updateDuration);
    musicAudio.addEventListener('durationchange', updateDuration);
    updateDuration();
    return () => {
      musicAudio.removeEventListener('loadedmetadata', updateDuration);
      musicAudio.removeEventListener('durationchange', updateDuration);
    };
  }, [audio.musicRef, track?.id]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
    }
  }, [messages]);

  // Play / Pause
  const handlePlayPause = useCallback(async () => {
    const state = playback.episodeState;
    if (state === 'idle' || state === 'error') {
      playback.setError(null);
      try {
        await playback.playEpisode();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    // state is preparing/story/crossfade/music — 按当前阶段暂停/恢复对应的音频元素。
    // 口播阶段绝不能 play() 音乐元素：音乐会在静音状态偷跑，
    // 提前触发 ended 把还没说完的口播切掉
    const musicAudio = audio.musicRef.current;
    const speechAudio = audio.speechRef.current;
    if (!musicAudio) return;

    const anyPlaying =
      (speechAudio && !speechAudio.paused) || !musicAudio.paused;

    if (anyPlaying) {
      speechAudio?.pause();
      musicAudio.pause();
      setIsPlaying(false);
    } else {
      const speechPhase = state === 'preparing' || state === 'story' || state === 'crossfade';
      if (speechPhase) {
        speechAudio?.play().catch(() => {});
        if (state === 'crossfade') musicAudio.play().catch(() => {});
      } else {
        musicAudio.play().catch(() => {});
      }
      setIsPlaying(true);
    }
    setCurrentTime(musicAudio.currentTime);
  }, [playback.episodeState, playback.setError, playback.playEpisode, audio.musicRef, audio.speechRef]);

  // Current error from playback
  const playbackError = playback.error;

  // Next
  const handleNext = useCallback(async () => {
    try {
      await playback.skipToNext();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [playback.skipToNext]);

  // Toggle favorite
  const handleToggleFavorite = useCallback(async () => {
    if (!track) return;
    if (isFavorited) {
      try {
        await removeFavorite(track.id);
        setFavorites((prev) => prev.filter((f) => f.trackId !== track.id));
      } catch { /* silent */ }
    } else {
      try {
        await addFavorite({ trackId: track.id, title: track.title, artist: track.artist, ...(track.album ? { album: track.album } : {}) });
        setFavorites((prev) => [...prev, { trackId: track.id, title: track.title, artist: track.artist, album: track.album ?? undefined, favoritedAt: new Date().toISOString() }]);
      } catch { /* silent */ }
    }
  }, [track, isFavorited]);

  // Chat send via SSE streaming
  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const trimmed = text.trim();
      setInputDraft('');
      setPendingSuggestions([]);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, from: 'YOU', text: trimmed };
      const djId = `dj-${Date.now()}`;
      const djPlaceholder: ChatMessage = { id: djId, from: 'DJ', text: '', streaming: true, origin: 'chat' };
      let streamedText = '';
      setMessages((prev) => [...prev, userMsg, djPlaceholder]);

      chatSSE.sendMessage(trimmed, {
        onChunk(chunk) {
          streamedText += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === djId ? { ...m, text: m.text + chunk } : m)),
          );
        },
        onDone(data) {
          const finalText = data.text || streamedText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === djId ? { ...m, text: finalText || m.text, streaming: false } : m,
            ),
          );
          if (data.action?.type === 'next-track') {
            handleNext();
            return;
          }

          if (data.action?.type === 'track-suggestion' && data.action.tracks?.length) {
            setPendingSuggestions(data.action.tracks);
          }

          if (
            data.action?.type === 'show-brief-created' ||
            data.action?.type === 'show-plan-refined' ||
            data.action?.type === 'show-confirmed' ||
            data.action?.type === 'show-cancelled'
          ) {
            const briefId = data.action.briefId ?? activeBriefId;
            setActiveView('library');
            refreshProductionData(briefId).catch(() => {});
            if (data.action.type === 'show-confirmed' && briefId) {
              startJobTracking(briefId);
              generateNow(briefId)
                .then(() => refreshProductionData(briefId))
                .catch(() => refreshProductionData(briefId));
            }
          }
        },
      });
    },
    [activeBriefId, chatSSE, handleNext, refreshProductionData, startJobTracking],
  );

  const handleConfirmSuggestion = useCallback(async (track: Track) => {
    try {
      await insertNextTrack(track);
      setPendingSuggestions([]);
      setMessages((prev) => [
        ...prev,
        { id: `dj-${Date.now()}`, from: 'DJ', text: `好，把《${track.title}》插到下一首了。`, origin: 'chat' },
      ]);
      // 丢掉之前预取的下一首（可能是旧推荐），重新预取——服务端会优先返回刚插入的曲目，
      // 让 UP NEXT 立刻显示这首歌，当前歌唱完后秒切到它。
      await playback.refreshPrefetch();
    } catch {
      // 插入失败保留候选名单，用户可重试。
    }
  }, [playback]);

  const handleGenerateNow = useCallback(async (briefId: string) => {
    // 后端的 /api/shows/generate-now 是同步执行整条流水线 (每个 block 选歌 + LLM + TTS),
    // 8 个 block 可能要 30-120 秒。await 在这里会让按钮一直停在 "Generating..." 没任何反馈。
    //
    // 改法: 先立刻切到 library 视图 + 启动 job 轮询, 让用户能实时看到右侧聊天栏底部的
    // ProductionProgressPanel 显示生成进度; 然后 fire-and-forget 调 generateNow,
    // 完成 / 失败时通过 polling 反映出来,不等响应才更新 UI。
    setActiveView('library');
    startJobTracking(briefId);
    generateNow(briefId)
      .then(() => refreshProductionData(briefId))
      .catch((err) => {
        // 用 warn 而不是 error,避免 Next.js dev overlay 把它当作 unhandled error 弹窗。
        // 真正的错误信息已经在后端日志和这条 warn 里、且会通过 trackedJob 状态展示给用户。
        console.warn("[generate-now] failed:", err);
        // 把错误塞到 trackedJob 里显示给用户。后端 preparation 阶段失败时 job 可能压根没创建,
        // poll 会一直空转;构造一个 client-side 失败 job 让 ProductionProgressPanel 把错误亮出来。
        const errMsg = err instanceof Error ? err.message : String(err);
        const nowIso = new Date().toISOString();
        setTrackedJob({
          id: `client-error-${briefId}`,
          briefId,
          planId: "",
          status: "failed",
          createdAt: nowIso,
          updatedAt: nowIso,
          logs: [{ timestamp: nowIso, level: "error", message: errMsg, phase: "preparation" }],
          trace: []
        });
        stopJobTracking();
        refreshProductionData(briefId).catch(() => {});
      });
  }, [refreshProductionData, startJobTracking, stopJobTracking]);

  // Derived display data
  const durationSec = track?.durationMs
    ? Math.round(track.durationMs / 1000)
    : audioDurationSec;
  const progress = durationSec && durationSec > 0 ? Math.min(currentTime / durationSec, 1) : 0;
  const timeStr = formatTime(clock);
  const isDark = theme === 'graphite';
  const sharedAudioElements = (
    <>
      <audio
        key="fakeradio-music-audio"
        ref={audio.musicRef}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      />
      <audio
        key="fakeradio-speech-audio"
        ref={audio.speechRef}
        preload="auto"
        playsInline
        style={{ display: 'none' }}
      />
    </>
  );

  // Mobile layout: vertical stack with bottom chat drawer
  if (bp === 'mobile') {
    return (
      <>
        {sharedAudioElements}
        <MobileRadio
          theme={theme}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          track={track}
          progress={progress}
          durationSec={durationSec}
          isPlaying={isPlaying}
          isLoading={playback.isLoadingEpisode}
          episodeState={playback.episodeState}
          error={playbackError}
          isFavorited={isFavorited}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onToggleFavorite={handleToggleFavorite}
          musicRef={audio.musicRef}
          typedText={displayTypedText}
          currentDjText={djSay}
          djLineIndex={djLineIndex}
          messages={messages}
          inputDraft={inputDraft}
          onInputChange={setInputDraft}
          onSend={handleSend}
          chatEndRef={chatEndRef}
          timeStr={timeStr}
        />
      </>
    );
  }

  return (
    <>
      {sharedAudioElements}
      <div
        style={{
          width: '100%',
          minHeight: '100vh',
          position: 'relative',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          paddingTop: 88,
        }}
      >
      {/* Subtle vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0.025), transparent 60%)'
            : 'radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.025), transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* TOP BAR */}
      <TopBar
        isLive={isLive}
        timeStr={timeStr}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        activeView={activeView}
        onNavigate={setActiveView}
        neteaseStatus={neteaseStatus}
        onOpenNeteaseLogin={() => setShowNeteaseLogin(true)}
        bp={bp}
      />

      {/* MAIN 3-COLUMN GRID */}
      <div
        style={{
          padding: bp === 'tablet' ? '24px 24px 56px' : '24px 56px 56px',
          display: 'grid',
          gridTemplateColumns: bp === 'tablet' ? '1fr' : '340px 1fr 320px',
          gap: bp === 'tablet' ? 32 : 48,
        }}
      >
        {/* LEFT — track + queue */}
        <LeftColumn
          track={track}
          progress={progress}
          durationSec={durationSec}
          queue={queue}
          isPlaying={isPlaying}
          episodeState={playback.episodeState}
          isLoading={playback.isLoadingEpisode}
          error={playbackError}
          isFavorited={isFavorited}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onToggleFavorite={handleToggleFavorite}
          musicRef={audio.musicRef}
          audio={audio}
          bp={bp}
        />

        {/* CENTER — visualizer + DJ quote / schedule / export / production / settings / library */}
        {activeView === 'main' ? (
          <CenterColumn
            typedText={displayTypedText}
            djLineIndex={djLineIndex}
            musicRef={audio.musicRef}
            isPlaying={isPlaying}
            bp={bp}
          />
        ) : activeView === 'library' ? (
          <LibraryView
            brief={activeBrief}
            briefs={briefs}
            showPlan={showPlan}
            jobs={jobs}
            projects={projects}
            onSwitchBrief={(id) => setActiveBriefId(id)}
            onProjectsChanged={refreshProjects}
            onGenerateNow={handleGenerateNow}
            onClose={() => setActiveView('main')}
          />
        ) : (
          <SettingsPanel
            isExpanded
            isOpen
            embedded
            onToggleExpand={() => {}}
            onClose={() => setActiveView('main')}
          />
        )}

        {/* RIGHT — chat transcript */}
        <RightColumn
          messages={messages}
          agentMessages={agentMessages}
          inputDraft={inputDraft}
          onInputChange={setInputDraft}
          onSend={handleSend}
          onQuickPrompt={handleSend}
          chatEndRef={chatEndRef}
          taste={taste}
          showTaste={showTaste}
          onToggleTaste={() => setShowTaste((v) => !v)}
          trackedJob={trackedJob}
          bp={bp}
          onDismissJob={() => { stopJobTracking(); setTrackedJob(null); }}
          pendingSuggestions={pendingSuggestions}
          onConfirmSuggestion={handleConfirmSuggestion}
          onDismissSuggestions={() => setPendingSuggestions([])}
        />
      </div>

      {/* Netease Login Modal */}
      {showNeteaseLogin && (
        <NeteaseLoginModal
          status={neteaseStatus}
          onClose={() => setShowNeteaseLogin(false)}
          onStatusChange={setNeteaseStatus}
        />
      )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────
function TopBar({
  isLive,
  timeStr,
  isDark,
  onToggleTheme,
  activeView,
  onNavigate,
  neteaseStatus,
  onOpenNeteaseLogin,
  bp,
}: {
  isLive: boolean;
  timeStr: string;
  isDark: boolean;
  onToggleTheme: () => void;
  activeView: 'main' | 'library' | 'settings';
  onNavigate: (view: 'main' | 'library' | 'settings') => void;
  neteaseStatus: NeteaseLoginStatus | null;
  onOpenNeteaseLogin: () => void;
  bp: Breakpoint;
}) {
  const isTablet = bp === 'tablet';
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: isTablet ? '20px 24px 0' : '32px 56px 0',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        zIndex: 6,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
        paddingBottom: 12,
      }}
    >
      {/* Logo + ON AIR + Netease */}
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            lineHeight: 1,
            letterSpacing: '-0.01em',
            fontStyle: 'italic',
          }}
        >
          FakeRadio<span style={{ color: 'var(--faint)' }}>.</span>
        </div>
        <button
          onClick={onOpenNeteaseLogin}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            marginTop: 6,
            letterSpacing: '0.15em',
            color: neteaseStatus?.loggedIn ? 'var(--text)' : 'var(--faint)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: neteaseStatus?.loggedIn ? '#4ade80' : 'var(--faint)',
            }}
          />
          {neteaseStatus?.loggedIn
            ? `网易云 · ${neteaseStatus.nickname ?? '已登录'}`
            : '网易云 · 未登录'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: isTablet ? 20 : 36, minWidth: 0, overflow: 'hidden' }}>
        {([
          { key: 'main' as const, label: '正在播放' },
          { key: 'library' as const, label: '节目库' },
          { key: 'settings' as const, label: '设置' },
        ]).map((it) => (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            style={{
              fontSize: 12,
              color: activeView === it.key ? 'var(--text)' : 'var(--mute)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom:
                activeView === it.key ? '1px solid var(--text)' : '1px solid transparent',
              paddingBottom: 3,
              cursor: activeView === it.key ? 'default' : 'pointer',
              background: 'none',
              fontFamily: 'inherit',
            }}
          >
            {it.label}
          </button>
        ))}
      </nav>

      {/* Right — ON AIR + theme toggle */}
      <div
        style={{
          textAlign: 'right',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--mute)',
            letterSpacing: '0.15em',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--text)',
              marginRight: 6,
              verticalAlign: 'middle',
              animation: isLive
                ? 'fr-pulse 2.4s ease-in-out infinite'
                : 'none',
              opacity: isLive ? 1 : 0.3,
            }}
          />
          <span suppressHydrationWarning>
            {isLive ? 'ON AIR' : 'OFF AIR'} · {timeStr}
          </span>
        </div>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>
    </div>
  );
}

function ThemeToggle({
  isDark,
  onToggle,
}: {
  isDark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        marginTop: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px 6px 8px',
        background: 'transparent',
        border: '1px solid var(--line)',
        borderRadius: 999,
        color: 'var(--text)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.22em',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--ink-soft)';
        e.currentTarget.style.borderColor = 'var(--faint)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'var(--line)';
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid var(--text)',
          background: `linear-gradient(90deg, ${isDark ? '#0e0e10' : '#f4f1ea'} 50%, ${isDark ? '#f4f1ea' : '#0e0e10'} 50%)`,
          flexShrink: 0,
        }}
      />
      <span>{isDark ? '切换浅色' : '切换深色'}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 歌名最多展示 3 行：≤3 行静态全部显示；>3 行则前 2 行静态、第 3 行把剩余文字做缓慢滚动。
// ─────────────────────────────────────────────────────────────
function MarqueeTitle({ text, bp }: { text: string; bp: Breakpoint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // mode: 'static' = ≤3 行直接展示；'split' = 前2行静态 + 第3行滚动剩余
  const [mode, setMode] = useState<'static' | 'split'>('static');
  const [first2, setFirst2] = useState('');
  const [rest, setRest] = useState('');

  const fontSize = bp === 'tablet' ? 44 : 64;
  const lineH = fontSize * 0.95;
  const sharedStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize,
    lineHeight: 0.95,
    fontWeight: 400,
    letterSpacing: '-0.02em',
  };

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const width = container.clientWidth;
      if (width === 0) return;
      measure.style.width = `${width}px`;
      measure.textContent = text;
      const totalLines = Math.round(measure.scrollHeight / lineH);
      if (totalLines <= 3) {
        setMode('static');
        return;
      }
      // 二分查找：最长的、渲染高度 ≤ 2 行的前缀。剩余部分进第 3 行滚动。
      let lo = 0, hi = text.length, best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        measure.textContent = text.slice(0, mid);
        if (measure.scrollHeight <= lineH * 2 + 0.5) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      setFirst2(text.slice(0, best));
      setRest(text.slice(best));
      setMode('split');
    };
    compute();
    // 字体异步加载会改变行数，加载完成后复测一次。
    let cancelled = false;
    const doc = typeof document !== 'undefined' ? (document as Document & { fonts?: { ready?: Promise<unknown> } }) : undefined;
    if (doc?.fonts?.ready) {
      doc.fonts.ready.then(() => {
        if (!cancelled) compute();
      });
    }
    if (typeof ResizeObserver === 'undefined') return () => { cancelled = true; };
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => { cancelled = true; ro.disconnect(); };
  }, [text, lineH]);

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 0 }}>
      {mode === 'static' ? (
        <div style={sharedStyle}>{text}</div>
      ) : (
        <>
          <div style={{ ...sharedStyle, height: lineH * 2, overflow: 'hidden' }}>{first2}</div>
          <SingleLineMarquee text={rest} style={sharedStyle} />
        </>
      )}
      {/* 隐藏测量层：与标题同字体同宽度，用来数行数和二分切分 */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          ...sharedStyle,
          position: 'absolute',
          left: 0,
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'normal',
        }}
      />
    </div>
  );
}

// 单行滚动：溢出才滚，不溢出静态。第 3 行剩余文字用这个。
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

// LeftColumn — track info + progress + queue
// ─────────────────────────────────────────────────────────────
function LeftColumn({
  track,
  progress,
  durationSec,
  queue,
  isPlaying,
  episodeState,
  isLoading,
  error,
  isFavorited,
  onPlayPause,
  onNext,
  onToggleFavorite,
  musicRef,
  audio,
  bp,
}: {
  track: Track | null;
  progress: number;
  durationSec: number | null;
  queue: Track[];
  isPlaying: boolean;
  episodeState: string;
  isLoading: boolean;
  error: string | null;
  isFavorited: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  musicRef: React.RefObject<HTMLAudioElement | null>;
  audio: AudioEngine;
  bp: Breakpoint;
}) {
  const title = track?.title ?? '—';
  const artist = track?.artist ?? '—';
  const album = track?.album ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
      {/* Track info */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.28em',
            color: 'var(--mute)',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}
        >
          N°<span style={{ marginLeft: 4 }}>003</span> &nbsp;/&nbsp; NOW
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MarqueeTitle text={title} bp={bp} />
          </div>
          {track && (
            <button
              onClick={onToggleFavorite}
              aria-label={isFavorited ? '取消收藏' : '收藏'}
              style={{
                marginTop: 8,
                flexShrink: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: isFavorited ? 'var(--text)' : 'var(--faint)',
                fontSize: 20,
                lineHeight: 1,
                transition: 'color 0.2s',
              }}
            >
              {isFavorited ? '♥' : '♡'}
            </button>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif-en)',
            fontSize: 18,
            fontStyle: 'italic',
            color: 'var(--mute)',
            marginBottom: 28,
          }}
        >
          by &nbsp;{artist}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--mute)',
            lineHeight: 1.8,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          ALBUM &nbsp;{' '}
          <span style={{ color: 'var(--text)' }}>{album || '—'}</span>
          <br />
          YEAR &nbsp;&nbsp; {track?.durationMs ? '—' : '—'}
          <br />
          SOURCE &nbsp;{track?.source ?? '—'}
        </div>
      </div>

      {/* Progress */}
      <div>
        <div
          style={{
            height: 1,
            background: 'var(--line)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progress * 100}%`,
              background: 'var(--text)',
              transition: 'width 0.3s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              top: -2,
              width: 1,
              height: 5,
              background: 'var(--text)',
              transform: 'translateX(-50%)',
              transition: 'left 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--mute)',
            marginTop: 10,
            letterSpacing: '0.08em',
          }}
        >
          <span>{fmtTime(durationSec ? progress * durationSec : null)}</span>
          <span>{fmtTime(durationSec)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onPlayPause}
          disabled={isLoading}
          style={{
            padding: '10px 24px',
            border: '1px solid var(--line)',
            borderRadius: 999,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            color: 'var(--text)',
            cursor: isLoading ? 'wait' : 'pointer',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ink-soft)';
            e.currentTarget.style.borderColor = 'var(--faint)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--line)';
          }}
        >
          {isLoading ? 'LOADING…' : isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          onClick={onNext}
          disabled={isLoading}
          style={{
            padding: '10px 24px',
            border: '1px solid var(--line)',
            borderRadius: 999,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            color: 'var(--mute)',
            cursor: isLoading ? 'wait' : 'pointer',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ink-soft)';
            e.currentTarget.style.borderColor = 'var(--faint)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--line)';
          }}
        >
          NEXT
        </button>
      </div>

      {/* Volume */}
      <VolumeControl audio={audio} />

      {/* Error display */}
      {error && (
        <div
          style={{
            fontSize: 11,
            color: '#c44',
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {/* Up Next */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.28em',
            color: 'var(--mute)',
            textTransform: 'uppercase',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>UP NEXT</span>
          <span>QUEUED BY DJ</span>
        </div>
        <div>
          {queue.slice(0, 3).map((q, i) => (
            <div
              key={q.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                alignItems: 'baseline',
                gap: 12,
                padding: '12px 0',
                borderTop: '1px solid var(--line)',
                fontSize: 13,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--faint)',
                  fontSize: 10,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    lineHeight: 1.2,
                  }}
                >
                  {q.title}
                </div>
                <div
                  style={{ color: 'var(--mute)', fontSize: 11, marginTop: 2 }}
                >
                  {q.artist}
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--faint)',
                  fontSize: 10,
                }}
              >
                {q.durationMs ? fmtTime(q.durationMs / 1000) : '—'}
              </span>
            </div>
          ))}
          {queue.length === 0 && (
            <div
              style={{
                padding: '12px 0',
                borderTop: '1px solid var(--line)',
                fontSize: 12,
                color: 'var(--faint)',
                fontStyle: 'italic',
              }}
            >
              队列为空
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--line)' }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CenterColumn — visualizer + DJ pullquote
// ─────────────────────────────────────────────────────────────
function CenterColumn({
  typedText,
  djLineIndex,
  musicRef,
  isPlaying,
  bp,
}: {
  typedText: string;
  djLineIndex: number;
  musicRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  bp: Breakpoint;
}) {
  const visualizer = useAudioReactiveVisualizer(musicRef, isPlaying);
  const visualizerSize = bp === 'tablet' ? 260 : 340;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
      }}
    >
      <MinimalVisualizer
        size={visualizerSize}
        levels={visualizer.levels}
        energy={visualizer.energy}
        reactive={visualizer.reactive}
      />

      {/* DJ pullquote */}
      <div
        style={{
          maxWidth: 460,
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.32em',
            color: 'var(--mute)',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <span
            style={{ width: 24, height: 1, background: 'var(--line)' }}
          />
          DJ — SPEAKING
          <span
            style={{ width: 24, height: 1, background: 'var(--line)' }}
          />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            lineHeight: 1.5,
            fontStyle: 'italic',
            color: 'var(--text)',
            minHeight: '3.2em',
            fontWeight: 400,
          }}
        >
          <span>&ldquo;{typedText}</span>
          <span
            style={{
              display: 'inline-block',
              width: '0.55em',
              height: '1em',
              background: 'var(--text)',
              verticalAlign: '-0.12em',
              marginLeft: '0.18em',
              opacity: 0.6,
              animation: 'fr-caret 1.1s steps(1) infinite',
            }}
          />
          <span>&rdquo;</span>
        </div>
      </div>
    </div>
  );
}

function MinimalVisualizer({
  size = 340,
  levels = EMPTY_VISUALIZER_LEVELS,
  energy = 0,
  reactive = false,
}: {
  size?: number;
  levels?: number[];
  energy?: number;
  reactive?: boolean;
}) {
  const bars = VISUALIZER_BARS;
  const color = 'var(--text)';
  const muteColor = 'var(--faint)';
  const ringOpacity = reactive ? 0.28 + energy * 0.34 : 0.4;
  const tickY = size * 0.529; // 约 180/340，cardinal tick 偏移按尺寸缩放

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* Concentric rings */}
      {[0.4, 0.65, 0.9].map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            inset: `${(1 - s) * 50}%`,
            borderRadius: '50%',
            border: `1px solid ${muteColor}`,
            opacity: Math.max(0.08, ringOpacity - i * 0.1),
            transition: 'opacity 120ms linear',
          }}
        />
      ))}

      {/* Center dot */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: color,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Inner circle */}
      <div
        style={{
          position: 'absolute',
          inset: '46%',
          borderRadius: '50%',
          border: `1px solid ${color}`,
          transform: `scale(${1 + energy * 0.12})`,
          transition: 'transform 80ms linear',
        }}
      />

      {/* Spectral bars */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 340 340"
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'fr-spin 80s linear infinite',
        }}
      >
        {Array.from({ length: bars }).map((_, i) => {
          const a = (i / bars) * Math.PI * 2;
          const r = 130;
          const idle = 3 + Math.abs(Math.sin(i * 0.38) * Math.cos(i * 0.21)) * 28;
          const level = levels[i] ?? 0;
          const h = reactive ? 3 + idle * 0.36 + level * 28 : idle;
          const rd = (v: number) => Math.round(v * 100) / 100;
          const x1 = rd(170 + Math.cos(a) * r);
          const y1 = rd(170 + Math.sin(a) * r);
          const x2 = rd(170 + Math.cos(a) * (r + h));
          const y2 = rd(170 + Math.sin(a) * (r + h));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={reactive ? 0.65 + level * 0.95 : 0.8}
              strokeLinecap="round"
              opacity={reactive ? 0.35 + level * 0.65 : 0.55 + (i % 4) * 0.1}
              style={{
                animation: reactive ? 'none' : `fr-wave ${1.3 + (i % 6) * 0.16}s ease-in-out infinite`,
                animationDelay: reactive ? undefined : `${i * 0.025}s`,
                transformOrigin: '170px 170px',
                transition: 'opacity 80ms linear, stroke-width 80ms linear',
              }}
            />
          );
        })}
      </svg>

      {/* Cardinal ticks */}
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 1,
            height: 6,
            background: color,
            transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${tickY}px)`,
            transformOrigin: 'center',
            opacity: 0.6,
          }}
        />
      ))}

      {/* Labels */}
      <div
        style={{
          position: 'absolute',
          top: -22,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muteColor,
          letterSpacing: '0.3em',
        }}
      >
        0°
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: -22,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muteColor,
          letterSpacing: '0.3em',
        }}
      >
        180°
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RightColumn — chat transcript
// ─────────────────────────────────────────────────────────────
function RightColumn({
  messages,
  agentMessages,
  inputDraft,
  onInputChange,
  onSend,
  onQuickPrompt,
  chatEndRef,
  taste,
  showTaste,
  onToggleTaste,
  trackedJob,
  onDismissJob,
  pendingSuggestions,
  onConfirmSuggestion,
  onDismissSuggestions,
  bp,
}: {
  messages: ChatMessage[];
  agentMessages: AgentMessage[];
  inputDraft: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  onQuickPrompt: (text: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  taste: TasteResponse | null;
  showTaste: boolean;
  onToggleTaste: () => void;
  trackedJob: ShowJob | null;
  onDismissJob: () => void;
  pendingSuggestions: Track[];
  onConfirmSuggestion: (track: Track) => void;
  onDismissSuggestions: () => void;
  bp: Breakpoint;
}) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const canSend = inputDraft.trim().length > 0;

  // tablet 单列：聊天区作为普通块参与流式布局，去掉三列时左侧的竖线/缩进和粘性定位
  const isTablet = bp === 'tablet';
  return (
    <div
      style={{
        borderLeft: isTablet ? 'none' : '1px solid var(--line)',
        paddingLeft: isTablet ? 0 : 32,
        display: 'flex',
        flexDirection: 'column',
        // 固定为视口高度并 sticky，消息在栏内滚动，避免聊天把整页撑长、
        // 滚动后看不到播放器。tablet 单列下改为普通块，不再粘性顶屏。
        position: isTablet ? 'static' : 'sticky',
        top: isTablet ? undefined : 112,
        alignSelf: 'start',
        height: isTablet ? undefined : 'calc(100vh - 136px)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.28em',
          color: 'var(--mute)',
          textTransform: 'uppercase',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>TRANSCRIPT</span>
        <span suppressHydrationWarning style={{ color: 'var(--faint)' }}>
          {timeStr} · TODAY
        </span>
      </div>

      <div
        ref={chatEndRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          overflowY: 'auto',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--faint)',
              fontStyle: 'italic',
            }}
          >
            跟 Nora 聊点什么吧…
          </div>
        )}
        {messages.map((m) => (
          <TranscriptLine key={m.id} from={m.from} text={m.text} streaming={m.streaming} />
        ))}
        {pendingSuggestions.length > 0 && (
          <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--faint)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', color: 'var(--faint)' }}>
              DJ 推荐 · 选一首插到下一首
            </div>
            {pendingSuggestions.map((t) => (
              <button
                key={t.id}
                onClick={() => onConfirmSuggestion(t)}
                style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--faint)', borderRadius: 4, padding: '6px 8px', cursor: 'pointer', color: 'var(--text)' }}
              >
                <span style={{ fontSize: 12 }}>《{t.title}》</span>{' '}
                <span style={{ fontSize: 11, color: 'var(--mute)' }}>{t.artist}</span>
              </button>
            ))}
            <button
              onClick={onDismissSuggestions}
              style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--faint)', fontSize: 10, cursor: 'pointer', padding: 0 }}
            >
              忽略
            </button>
          </div>
        )}
      </div>

      {/* Production progress + trace */}
      {trackedJob && (
        <ProductionProgressPanel job={trackedJob} onDismiss={onDismissJob} />
      )}

      {/* Agent messages */}
      {agentMessages.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', color: 'var(--faint)' }}>
            ACTIVITY
          </div>
          {agentMessages.slice(-3).map((msg, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--faint)', lineHeight: 1.4, fontFamily: 'var(--font-mono)' }}>
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Taste */}
      {taste && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={onToggleTaste}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.22em',
              color: 'var(--faint)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 8 }}>{showTaste ? '▼' : '▶'}</span>
            TASTE
          </button>
          {showTaste && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {taste.taste && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.15em', marginBottom: 4 }}>
                    PROFILE
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                    {taste.taste}
                  </div>
                </div>
              )}
              {taste.routines && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.15em', marginBottom: 4 }}>
                    ROUTINES
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                    {taste.routines}
                  </div>
                </div>
              )}
              {taste.playlists.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.15em', marginBottom: 4 }}>
                    PLAYLISTS
                  </div>
                  {taste.playlists.map((pl) => (
                    <div key={pl.id} style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>
                      <span style={{ fontWeight: 500 }}>{pl.name}</span>
                      {pl.description && (
                        <span style={{ color: 'var(--faint)', marginLeft: 6 }}>— {pl.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {taste.moodRules && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.15em', marginBottom: 4 }}>
                    MOOD RULES
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                    {taste.moodRules}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {QUICK_PROMPTS.map((qp) => (
          <button
            key={qp.label}
            onClick={() => onQuickPrompt(qp.prompt)}
            style={{
              padding: '5px 12px',
              border: '1px solid var(--line)',
              borderRadius: 999,
              background: 'transparent',
              color: 'var(--mute)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ink-soft)';
              e.currentTarget.style.borderColor = 'var(--faint)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--line)';
            }}
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          paddingTop: 18,
          marginTop: 18,
          borderTop: '1px solid var(--line)',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSend(inputDraft);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingBottom: 8,
            borderBottom: '1px solid var(--text)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--mute)',
              letterSpacing: '0.2em',
            }}
          >
            YOU
          </span>
          <input
            placeholder="给 Nora 写一句话…"
            value={inputDraft}
            onChange={(e) => onInputChange(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 13.5,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '4px 8px',
              border: '1px solid var(--line)',
              borderRadius: 2,
              background: canSend ? 'var(--text)' : 'transparent',
              color: canSend ? 'var(--paper)' : 'var(--mute)',
              letterSpacing: '0.08em',
              cursor: canSend ? 'pointer' : 'default',
              opacity: canSend ? 1 : 0.55,
            }}
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}

function TranscriptLine({ from, text, streaming }: { from: 'DJ' | 'YOU'; text: string; streaming?: boolean | undefined }) {
  const isMe = from === 'YOU';
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: isMe ? 'var(--faint)' : 'var(--mute)',
          letterSpacing: '0.22em',
          marginBottom: 5,
        }}
      >
        {from}
      </div>
      <div
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: isMe ? 'var(--mute)' : 'var(--text)',
          fontFamily: isMe
            ? 'var(--font-body)'
            : 'var(--font-display)',
          fontStyle: isMe ? 'normal' : 'italic',
        }}
      >
        {text || (streaming ? '' : '')}
        {streaming && (
          <span
            style={{
              display: 'inline-block',
              width: '0.55em',
              height: '1em',
              background: 'var(--text)',
              verticalAlign: '-0.12em',
              marginLeft: '0.18em',
              opacity: 0.6,
              animation: 'fr-caret 1.1s steps(1) infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ProductionProgressPanel — 编排进度 + trace（聊天栏内）
// ─────────────────────────────────────────────────────────────
const JOB_STATUS_LABELS: Record<string, string> = {
  pending: '排队中',
  running: '生成中',
  paused: '已暂停',
  'needs-replan': '待重排',
  completed: '已完成',
  failed: '失败',
};

function ProductionProgressPanel({ job, onDismiss }: { job: ShowJob; onDismiss: () => void }) {
  const isActive = job.status === 'pending' || job.status === 'running';
  const isFailed = job.status === 'failed';
  const statusLabel = JOB_STATUS_LABELS[job.status] ?? job.status;
  const recentLogs = job.logs.slice(-3);
  const recentTrace = job.trace.slice(-4);

  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--ink-soft)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: recentLogs.length + recentTrace.length > 0 ? 8 : 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.22em',
            color: 'var(--mute)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: isFailed ? '#c44' : isActive ? 'var(--text)' : '#4ade80',
              animation: isActive ? 'fr-pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          节目编排 · {statusLabel}
        </div>
        <button
          onClick={onDismiss}
          aria-label="关闭编排进度"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--faint)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {isFailed && job.error && (
        <div style={{ fontSize: 11, color: '#c44', lineHeight: 1.5, marginBottom: 6 }}>
          {job.error}
        </div>
      )}

      {recentLogs.map((log, i) => (
        <div
          key={`log-${i}`}
          style={{
            fontSize: 10.5,
            lineHeight: 1.6,
            color: log.level === 'error' ? '#c44' : 'var(--mute)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {log.phase ? `[${log.phase}] ` : ''}{log.message}
        </div>
      ))}

      {recentTrace.length > 0 && (
        <div style={{ marginTop: recentLogs.length > 0 ? 6 : 0 }}>
          {recentTrace.map((entry, i) => (
            <div
              key={`trace-${i}`}
              style={{
                fontSize: 10.5,
                lineHeight: 1.6,
                color: entry.success ? 'var(--faint)' : '#c44',
                fontFamily: 'var(--font-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.success ? '✓' : '✗'} {entry.operation}
              {entry.durationMs !== undefined ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ''}
              {' — '}{entry.errorSummary ?? entry.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VolumeControl
// ─────────────────────────────────────────────────────────────
function VolumeControl({ audio }: { audio: AudioEngine }) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    // 走 AudioEngine 统一设置：跨曲目/跨音乐与口播都生效，不会被 crossfade fade 覆盖。
    audio.setUserVolume(v);
    if (audio.musicRef.current) audio.musicRef.current.muted = v === 0;
    if (audio.speechRef.current) audio.speechRef.current.muted = v === 0;
  }, [audio]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (audio.musicRef.current) audio.musicRef.current.muted = next;
    if (audio.speechRef.current) audio.speechRef.current.muted = next;
  }, [audio, muted]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={toggleMute}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--mute)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          padding: 0,
          width: 16,
          textAlign: 'center',
        }}
      >
        {muted || volume === 0 ? 'M' : 'V'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={handleChange}
        style={{
          flex: 1,
          height: 2,
          cursor: 'pointer',
          accentColor: 'var(--text)',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--faint)',
          width: 28,
          textAlign: 'right',
          letterSpacing: '0.05em',
        }}
      >
        {Math.round((muted ? 0 : volume) * 100)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NeteaseLoginModal
// ─────────────────────────────────────────────────────────────
function NeteaseLoginModal({
  status,
  onClose,
  onStatusChange,
}: {
  status: NeteaseLoginStatus | null;
  onClose: () => void;
  onStatusChange: (s: NeteaseLoginStatus) => void;
}) {
  const [tab, setTab] = useState<'cookie' | 'qr'>('qr');
  const [cookieInput, setCookieInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrData, setQrData] = useState<{ key: string; qrImageUrl: string } | null>(null);
  const [qrChecking, setQrChecking] = useState(false);
  const [qrMessage, setQrMessage] = useState<string>('等待扫码…');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // 通用 Cookie 文件解析：支持 Netscape / JSON / Header 三种格式，
  // 自动提取 music.163.com 的有效 Cookie 拼成请求头格式
  const parseCookieFile = (content: string): string => {
    const NETEASE_KEYS = ['MUSIC_U', '__csrf', 'MUSIC_A', 'MUSIC_R', 'NMTID', '_ntes_nuid', '__remember_me', 'os', 'appver', 'osver', 'channel', 'requestId', '__remember_me'];

    // 尝试 JSON（EditThisCookie 导出格式：[{name,value,domain,...}])
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((c: any) => {
          const d = (c.domain || '').toLowerCase();
          return d.includes('music.163.com') || d.includes('163.com');
        });
        if (filtered.length > 0) {
          return filtered.map((c: any) => `${c.name}=${c.value}`).join('; ');
        }
      }
    } catch { /* not JSON, try next */ }

    // 尝试 Netscape 格式（每行 tab 分隔：domain\tTRUE\tpath\tsecure\texpiry\tname\tvalue）
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const cookies: Record<string, string> = {};
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 7) {
        const domain = (parts[0] ?? '').toLowerCase();
        const name = parts[5] ?? '';
        const value = parts[6] ?? '';
        if ((domain.includes('music.163.com') || domain.includes('163.com')) && NETEASE_KEYS.includes(name)) {
          cookies[name] = value;
        }
      }
    }
    const netscapeResult = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (netscapeResult) return netscapeResult;

    // 尝试 Header 格式（MUSIC_U=...; __csrf=...）
    const headerMatch = content.match(/MUSIC_U=[^;]+/);
    if (headerMatch) return content.trim();

    return content.trim(); // fallback: 原样返回
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCookieFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') return;
      const extracted = parseCookieFile(text);
      if (extracted) {
        setCookieInput(extracted);
        // 自动检测到 MUSIC_U 就提示成功
        if (extracted.includes('MUSIC_U')) {
          setError(null);
        } else {
          setError('文件中未找到网易云有效 Cookie（需要 MUSIC_U）');
        }
      } else {
        setError('无法解析该文件');
      }
    };
    reader.readAsText(file);
    // reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleCookieSubmit = async () => {
    if (!cookieInput.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitNeteaseCookie(cookieInput.trim());
      // 服务端保存后已验证：loggedIn 才算登录成功
      const fresh = await getNeteaseLoginStatus();
      onStatusChange(fresh);
      if (result.loggedIn) {
        onClose();
      } else {
        setError(result.message || 'Cookie 验证未通过，请重新获取');
      }
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartQr = async () => {
    setError(null);
    try {
      const challenge = await createNeteaseQrLogin();
      setQrData(challenge);
      setQrChecking(true);
      setQrMessage('等待扫码…');
      // Poll for QR scan result
      pollRef.current = setInterval(async () => {
        try {
          const result = await checkNeteaseQrLogin(challenge.key);
          // 801 等待扫码 / 800 已扫码待确认 / 802 待确认 / 803 登录成功
          setQrMessage(result.message || '等待扫码…');
          if (result.loggedIn) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            const fresh = await getNeteaseLoginStatus();
            onStatusChange(fresh);
            if (fresh.loggedIn) {
              onClose();
            } else {
              // 扫码成功但 status 校验未通过：cookie 可能不完整
              setError('扫码已完成，但登录状态校验未通过，请改用 Cookie 注入');
              setQrChecking(false);
            }
          }
        } catch {
          // silent, keep polling
        }
      }, 2000);
    } catch {
      setError('获取二维码失败');
    }
  };

  const handleStopQr = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQrChecking(false);
    setQrData(null);
    setQrMessage('等待扫码…');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 28,
          width: 360,
          maxWidth: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ color: 'var(--text)', margin: 0, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
              网易云音乐登录
            </h3>
            {status?.loggedIn && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mute)' }}>
                当前: {status.nickname ?? '已登录'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--mute)',
              cursor: 'pointer',
              fontSize: 18,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
          {(['cookie', 'qr'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--mute)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.15em',
                cursor: 'pointer',
              }}
            >
              {t === 'cookie' ? 'COOKIE' : 'QR 扫码'}
            </button>
          ))}
        </div>

        {/* Cookie tab */}
        {tab === 'cookie' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 8, lineHeight: 1.5 }}>
              扫码登录更方便，建议优先用「QR 扫码」。Cookie 注入作为备选：
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json,.cookie,.cookies"
              onChange={handleCookieFileImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--ink-soft)',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                marginBottom: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              📂 导入 Cookies 文件（Netscape / JSON / Header 格式）
            </button>
            <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 12, lineHeight: 1.6 }}>
              支持 EditThisCookie 导出的 Netscape 或 JSON 文件，自动提取 <code style={{ color: 'var(--mute)' }}>MUSIC_U</code>。也可手动粘贴 <code style={{ color: 'var(--mute)' }}>MUSIC_U=...; __csrf=...</code>
            </p>
            <textarea
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              placeholder="MUSIC_U=...; __csrf=..."
              rows={4}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--ink-soft)',
                color: 'var(--text)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleCookieSubmit}
              disabled={submitting || !cookieInput.trim()}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '10px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#000',
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? '提交中…' : '提交 Cookie'}
            </button>
          </div>
        )}

        {/* QR tab */}
        {tab === 'qr' && (
          <div style={{ textAlign: 'center' }}>
            {!qrData ? (
              <div>
                <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 16, lineHeight: 1.5 }}>
                  生成二维码后，使用网易云音乐 App 扫码登录。
                </p>
                <button
                  onClick={handleStartQr}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  生成二维码
                </button>
              </div>
            ) : (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrData.qrImageUrl}
                  alt="QR Code"
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    marginBottom: 12,
                  }}
                />
                <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 12 }}>
                  {qrChecking ? qrMessage : '已停止'}
                </p>
                <button
                  onClick={handleStopQr}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    background: 'transparent',
                    color: 'var(--mute)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#c44', textAlign: 'center' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────
function formatTime(d: Date): string {
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':');
}

function fmtTime(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s) || s <= 0) return '--:--';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// MobileRadio — mobile layout (< 640px)
// ─────────────────────────────────────────────────────────────
type MobileRadioProps = {
  theme: Theme;
  isDark: boolean;
  onToggleTheme: () => void;
  track: Track | null;
  progress: number;
  durationSec: number | null;
  isPlaying: boolean;
  isLoading: boolean;
  episodeState: string;
  error: string | null;
  isFavorited: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  musicRef: React.RefObject<HTMLAudioElement | null>;
  typedText: string;
  currentDjText: string;
  djLineIndex: number;
  messages: ChatMessage[];
  inputDraft: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  timeStr: string;
};

function MobileRadio({
  isDark, onToggleTheme,
  track, progress, durationSec,
  isPlaying, isLoading, error,
  isFavorited, onPlayPause, onNext, onToggleFavorite, musicRef,
  typedText, currentDjText,
  messages, inputDraft, onInputChange, onSend, chatEndRef, timeStr,
}: MobileRadioProps) {
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const title = track?.title ?? '—';
  const artist = track?.artist ?? '—';
  const cnLabel = isDark ? 'EDITORIAL · DARK' : 'EDITORIAL · LIGHT';
  const canSend = inputDraft.trim().length > 0;
  // 对话框收所有非空消息，包括音乐口播 broadcast。
  // 之前会把跟 DJ-speaking 区文字相同的 broadcast 过滤掉（避免重复），
  // 但 DJ-speaking 区现在只放当前曲目介绍，不再 mirror 聊天回复，
  // 把口播也一起留在对话框反而能让用户看历史。
  const chatMessages = messages.filter((m) => m.text.trim().length > 0);
  const visualizer = useAudioReactiveVisualizer(musicRef, isPlaying);
  const handleVisualizerPlayPause = useCallback(() => {
    visualizer.resume();
    onPlayPause();
  }, [onPlayPause, visualizer]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        minHeight: 667,
        position: 'relative',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
      }}
    >
      {/* Vignette */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: isDark
            ? 'radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0.025), transparent 60%)'
            : 'radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.025), transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Status bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '14px 28px 0',
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text)',
          zIndex: 10,
        }}
      >
        <span>{timeStr.slice(0, 5)}</span>
        <span>•••</span>
      </div>

      {/* Header — channel label + theme toggle */}
      <div
        style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--mute)', letterSpacing: '0.2em',
          }}
        >
          CH · {cnLabel}
        </div>
        <button
          onClick={onToggleTheme}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 9px 5px 7px',
            background: 'transparent', border: '1px solid var(--line)',
            borderRadius: 999, color: 'var(--text)',
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: 12, height: 12, borderRadius: '50%',
              border: '1px solid var(--text)',
              background: `linear-gradient(90deg, ${isDark ? '#0e0e10' : '#f4f1ea'} 50%, ${isDark ? '#f4f1ea' : '#0e0e10'} 50%)`,
              flexShrink: 0,
            }}
          />
          <span>{isDark ? '浅色' : '深色'}</span>
        </button>
      </div>

      {/* Visualizer — 220×220 */}
      <div
        style={{
          position: 'absolute', top: 82, left: 0, right: 0,
          height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 5,
        }}
      >
        <MiniVisualizer
          size={204}
          levels={visualizer.levels}
          energy={visualizer.energy}
          reactive={visualizer.reactive}
        />
      </div>

      {/* Now playing — centered */}
      <div
        style={{
          position: 'absolute', top: 326, left: 24, right: 24,
          textAlign: 'center',
          zIndex: 6,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 8vw, 34px)', fontWeight: 400,
            lineHeight: 1.06, fontStyle: 'italic', letterSpacing: '-0.01em',
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif-en)', fontStyle: 'italic',
            fontSize: 13, color: 'var(--accent)', marginTop: 5,
          }}
        >
          {artist}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 402, left: 0, right: 0, padding: '0 24px', zIndex: 6 }}>
        <div style={{ height: 1, background: 'var(--line)', position: 'relative' }}>
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${progress * 100}%`, background: 'var(--text)',
              transition: 'width 0.3s ease',
            }}
          />
          <div
            style={{
              position: 'absolute', left: `${progress * 100}%`, top: -2,
              width: 1, height: 5, background: 'var(--text)',
              transform: 'translateX(-50%)', transition: 'left 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)',
            marginTop: 6, letterSpacing: '0.08em',
          }}
        >
          <span>{fmtTime(durationSec ? progress * durationSec : null)}</span>
          <span>{fmtTime(durationSec)}</span>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          position: 'absolute', top: 434, left: 24, right: 24,
          display: 'flex', gap: 10, justifyContent: 'center',
          zIndex: 6,
        }}
      >
        <button
          onClick={handleVisualizerPlayPause}
          disabled={isLoading}
          style={{
            padding: '8px 20px', border: '1px solid var(--line)', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
            color: 'var(--text)', background: 'transparent',
            cursor: isLoading ? 'wait' : 'pointer',
          }}
        >
          {isLoading ? '…' : isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          onClick={onNext}
          disabled={isLoading}
          style={{
            padding: '8px 20px', border: '1px solid var(--line)', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
            color: 'var(--mute)', background: 'transparent',
            cursor: isLoading ? 'wait' : 'pointer',
          }}
        >
          NEXT
        </button>
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorited ? '取消收藏' : '收藏'}
          style={{
            padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 999,
            background: 'transparent', cursor: 'pointer',
            color: isFavorited ? 'var(--text)' : 'var(--faint)', fontSize: 16,
          }}
        >
          {isFavorited ? '♥' : '♡'}
        </button>
      </div>

      {/* DJ subtitle card */}
      <div
        style={{
          position: 'absolute', top: 478, left: 24, right: 24,
          padding: '14px 18px',
          border: '1px solid var(--line)', borderRadius: 18,
          zIndex: 6,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em',
            color: 'var(--accent)', marginBottom: 6,
          }}
        >
          DJ · 正在说话
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)', fontSize: 15,
            lineHeight: 1.5, color: 'var(--text)', minHeight: '2em',
          }}
        >
          {typedText || '等待播放…'}
          <span
            style={{
              display: 'inline-block', width: '0.55em', height: '1em',
              background: 'var(--text)', verticalAlign: '-0.12em',
              marginLeft: '0.18em', opacity: 0.6,
              animation: 'fr-caret 1.1s steps(1) infinite',
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ position: 'absolute', top: 570, left: 24, right: 24, fontSize: 11, color: '#c44', zIndex: 7 }}>
          {error}
        </div>
      )}

      {/* Chat drawer */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--line)',
          borderRadius: '24px 24px 0 0',
          zIndex: 20,
          height: drawerExpanded ? '60vh' : 204,
          maxHeight: drawerExpanded ? '60vh' : 204,
          padding: '14px 24px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'height 300ms ease, max-height 300ms ease',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Grab bar */}
        <div
          onClick={() => setDrawerExpanded((v) => !v)}
          style={{
            width: 38, height: 4, borderRadius: 2,
            background: 'var(--mute)', margin: '0 auto 14px', opacity: 0.4,
            cursor: 'pointer', flexShrink: 0,
          }}
          role="button"
          aria-label={drawerExpanded ? '收起聊天' : '展开聊天'}
        />

        {/* Chat header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 12, flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'fr-pulse 1.5s ease-in-out infinite',
            }}
          />
          <div
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--mute)', letterSpacing: '0.18em',
            }}
          >
            和 DJ 聊聊
          </div>
        </div>

        {/* Last message preview (when collapsed) */}
        {!drawerExpanded && chatMessages.length > 0 && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 12,
              border: '1px solid var(--line)',
              fontSize: 12, lineHeight: 1.5,
              fontFamily: 'var(--font-display)', color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            {chatMessages[chatMessages.length - 1]?.text ?? ''}
          </div>
        )}

        {/* Messages (when expanded) */}
        {drawerExpanded && (
          <div
            ref={chatEndRef}
            style={{
              flex: 1, overflowY: 'auto',
              minHeight: 0,
              padding: '0 0 8px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            {chatMessages.map((m) => (
              <div key={m.id}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: m.from === 'YOU' ? 'var(--faint)' : 'var(--mute)',
                    letterSpacing: '0.22em', marginBottom: 3,
                  }}
                >
                  {m.from}
                </div>
                <div
                  style={{
                    fontSize: 13, lineHeight: 1.5,
                    color: m.from === 'YOU' ? 'var(--mute)' : 'var(--text)',
                    fontFamily: m.from === 'YOU' ? 'var(--font-body)' : 'var(--font-display)',
                    fontStyle: m.from === 'YOU' ? 'normal' : 'italic',
                  }}
                >
                  {m.text}
                  {m.streaming && (
                    <span
                      style={{
                        display: 'inline-block', width: '0.55em', height: '1em',
                        background: 'var(--text)', verticalAlign: '-0.12em',
                        marginLeft: '0.18em', opacity: 0.6,
                        animation: 'fr-caret 1.1s steps(1) infinite',
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSend(inputDraft);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            border: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <input
            placeholder="说点什么…"
            value={inputDraft}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={() => setDrawerExpanded(true)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-body)',
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              border: 'none', cursor: canSend ? 'pointer' : 'default',
              background: canSend ? 'var(--accent)' : 'var(--line)',
              color: 'var(--bg)', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MiniVisualizer — mobile (220 × 220)
// ─────────────────────────────────────────────────────────────
function MiniVisualizer({
  size = 220,
  levels = EMPTY_VISUALIZER_LEVELS,
  energy = 0,
  reactive = false,
}: {
  size?: number;
  levels?: number[];
  energy?: number;
  reactive?: boolean;
}) {
  const bars = 72;
  const ringOpacity = reactive ? 0.28 + energy * 0.34 : 0.4;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {[0.4, 0.65, 0.9].map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', inset: `${(1 - s) * 50}%`,
            borderRadius: '50%', border: '1px solid var(--faint)',
            opacity: Math.max(0.08, ringOpacity - i * 0.1),
            transition: 'opacity 120ms linear',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute', inset: '46%',
          borderRadius: '50%', border: '1px solid var(--text)',
          transform: `scale(${1 + energy * 0.12})`,
          transition: 'transform 80ms linear',
        }}
      />
      <svg
        width={size} height={size} viewBox="0 0 220 220"
        style={{ animation: 'fr-spin 80s linear infinite' }}
      >
        {Array.from({ length: bars }).map((_, i) => {
          const a = (i / bars) * Math.PI * 2;
          const r = 72;
          const idle = 3 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 0.2)) * 18;
          const level = levels[i] ?? 0;
          const h = reactive ? 3 + idle * 0.36 + level * 28 : idle;
          const rd = (v: number) => Math.round(v * 100) / 100;
          return (
            <line
              key={i}
              x1={rd(110 + Math.cos(a) * r)}
              y1={rd(110 + Math.sin(a) * r)}
              x2={rd(110 + Math.cos(a) * (r + h))}
              y2={rd(110 + Math.sin(a) * (r + h))}
              stroke="currentColor"
              strokeWidth={reactive ? 0.65 + level * 0.95 : 0.8}
              strokeLinecap="round"
              opacity={reactive ? 0.35 + level * 0.65 : 0.55 + (i % 4) * 0.1}
              style={{
                animation: reactive ? 'none' : `fr-wave ${1.3 + (i % 6) * 0.16}s ease-in-out infinite`,
                animationDelay: reactive ? undefined : `${i * 0.025}s`,
                transformOrigin: '110px 110px',
                transition: 'opacity 80ms linear, stroke-width 80ms linear',
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
