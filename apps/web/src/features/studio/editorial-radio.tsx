'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useAudioEngine } from '../player/use-audio-engine';
import { usePlaybackState } from '../player/use-playback-state';
import { useStreamConnection } from '../player/use-stream-connection';
import type { AgentMessage } from '../player/use-stream-connection';
import { useChatSSE } from '../player/use-chat-sse';
import { SettingsPanel } from '../show/settings-panel';
import { LibraryView } from '../show/library-view';
import { RadioScreen, type RadioView } from './radio-screen';
import { ChatSection, ChatInput, type ChatMessage } from './radio-chat';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Theme = 'light' | 'dark';

/** 消息时间戳 HH:MM，聊天气泡右下角显示 */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// EditorialRadio — main page
// ─────────────────────────────────────────────────────────────
export function EditorialRadio() {
  const audio = useAudioEngine();
  const playback = usePlaybackState(audio);

  // Theme
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // 兼容旧值：bone→light、graphite→dark
    const stored = localStorage.getItem('fakeradio.theme');
    if (stored === 'light' || stored === 'bone') {
      setTheme('light');
    } else if (stored === 'dark' || stored === 'graphite') {
      setTheme('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSetTheme = useCallback((next: Theme) => {
    localStorage.setItem('fakeradio.theme', next);
    setTheme(next);
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
  const [activeView, setActiveView] = useState<RadioView>('main');

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
      { id: `dj-ep-${trackId}-${Date.now()}`, from: 'DJ', text: story, origin: 'broadcast', at: nowHHMM() },
    ]);
  }, [playback.episodeData?.track.id, playback.episodeData?.story.text]);

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
          { id: `dj-${Date.now()}`, from: 'DJ', text: dj.say, origin: 'broadcast', at: nowHHMM() },
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
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, from: 'YOU', text: trimmed, at: nowHHMM() };
      const djId = `dj-${Date.now()}`;
      const djPlaceholder: ChatMessage = { id: djId, from: 'DJ', text: '', streaming: true, origin: 'chat', at: nowHHMM() };
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
        { id: `dj-${Date.now()}`, from: 'DJ', text: `好，把《${track.title}》插到下一首了。`, origin: 'chat', at: nowHHMM() },
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

  // 节目库 / 设置以覆盖层形式渲染在手机框内（入口在右上角菜单）
  const overlayArea =
    activeView === 'library' ? (
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
    ) : activeView === 'settings' ? (
      <SettingsPanel
        isExpanded
        isOpen
        embedded
        onToggleExpand={() => {}}
        onClose={() => setActiveView('main')}
      />
    ) : null;

  return (
    <>
      {sharedAudioElements}
      <RadioScreen
        theme={theme}
        onSetTheme={handleSetTheme}
        clock={clock}
        isLive={isLive}
        track={track}
        progress={progress}
        currentTime={currentTime}
        durationSec={durationSec}
        isPlaying={isPlaying}
        isLoading={playback.isLoadingEpisode}
        error={playbackError}
        isFavorited={isFavorited}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onToggleFavorite={handleToggleFavorite}
        musicRef={audio.musicRef}
        audio={audio}
        queue={queue}
        view={activeView}
        onNavigate={setActiveView}
        neteaseLoggedIn={neteaseStatus?.loggedIn ?? false}
        onOpenNeteaseLogin={() => setShowNeteaseLogin(true)}
        chatArea={
          <ChatSection
            connected={streamStatus.label === '已连接'}
            messages={messages}
            agentMessages={agentMessages}
            chatEndRef={chatEndRef}
            taste={taste}
            showTaste={showTaste}
            onToggleTaste={() => setShowTaste((v) => !v)}
            trackedJob={trackedJob}
            onDismissJob={() => { stopJobTracking(); setTrackedJob(null); }}
            pendingSuggestions={pendingSuggestions}
            onConfirmSuggestion={handleConfirmSuggestion}
            onDismissSuggestions={() => setPendingSuggestions([])}
          />
        }
        inputArea={
          <ChatInput inputDraft={inputDraft} onInputChange={setInputDraft} onSend={handleSend} />
        }
        overlayArea={overlayArea}
      />

      {showNeteaseLogin && (
        <NeteaseLoginModal
          status={neteaseStatus}
          onClose={() => setShowNeteaseLogin(false)}
          onStatusChange={setNeteaseStatus}
        />
      )}
    </>
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
