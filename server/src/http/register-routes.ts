import { z } from "zod";
import {
  EpisodeNextResponseSchema,
  EpisodePlayingRequestSchema,
  FavoriteRequestSchema,
  FavoritesResponseSchema,
  InsertNextRequestSchema,
  HealthResponseSchema,
  LikedSongsDiagnosticsSchema,
  NeteaseCookieSubmitRequestSchema,
  NeteaseCookieSubmitResponseSchema,
  NextResponseSchema,
  PrewarmStatusSchema,
  StreamEventSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  type RadioEpisode
} from "@fakeradio/shared";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { formatRadioDate } from "../utils/time.js";
import { proxyAndRecord, isAudioRecorded, getAudioFilePath } from "../audio/audio-recorder.js";
import { startExportTask, getExportTask, getExportFilePath, exportShowProject } from "../export/export-pipeline.js";
import { inferAndSaveTaste } from "../user/taste-inferer.js";
import type { PlaybackState } from "./playback-state.js";
import { resolveNextTrackAndDecision, composeEpisodeFromTrack, synthesizeWithFallback, buildPersonalHistorySnippet, type EpisodeRunnerDeps, type ComposeEpisodeDeps } from "./episode-runner.js";
import { runPrewarmForDate, type PrewarmDeps } from "../scheduler/daily-episode-prewarmer.js";
import { handleChat } from "./chat-intent-router.js";
import { registerShowRoutes } from "./routes/show-routes.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import type { RegisterRoutesDeps } from "./types.js";
import { buildRecommendationContext, selectRecommendedCandidates } from "../recommendation/recommendation-engine.js";

const LOCAL_WEB_ORIGINS = new Set([
  "http://localhost:3302",
  "http://127.0.0.1:3302",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const RECENT_PLAY_EXCLUSION_DAYS = 14;
const RECENT_PLAY_EXCLUSION_LIMIT = 200;

function getCorsHeadersForOrigin(origin: unknown): Record<string, string> {
  if (typeof origin !== "string" || !LOCAL_WEB_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin"
  };
}

export function registerRoutes(deps: RegisterRoutesDeps) {
  const {
    app, state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, llmStatus, music, musicStatus, ttsStatus, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, weatherStatus, calendar, calendarStatus, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, currentMoodHint, nowProvider,
    storySourceStatus, webResearchStatus, neteaseAuth, runtimeManager, baseDir, programBriefRepo,
    showPlanRepo, showPlanGenerator, dailyShowPlanGenerator, jobRegistry, showProjectRepo,
    prewarmRefillEnabled = true
  } = deps;

  const getAdapterStatuses = () => runtimeManager?.getStatuses() ?? {
    llm: llmStatus,
    music: musicStatus,
    tts: ttsStatus,
    weather: weatherStatus,
    calendar: calendarStatus,
    upnp: "disabled" as const,
    storySource: storySourceStatus,
    webResearch: webResearchStatus
  };

  const episodeRunnerDeps: EpisodeRunnerDeps = {
    llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, memory, state, systemPrompt,
    userPreferences, musicStatus, currentMoodHint, nowProvider, likedSongs
  };

  const composeEpisodeDeps: ComposeEpisodeDeps = {
    llm, tts, ttsCacheDir, storySource,
    publicMetadataAdapter, webResearchAdapter,
    weather, calendar, devices, systemPrompt
  };

  const prewarmDeps: PrewarmDeps = {
    llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, likedSongs, stateRepo, nowProvider, audioDir, userPreferences
  };

  // 后台补生成 prepared episodes：当前 block 剩余 ready 低于低水位时，
  // 异步补到 FAKERADIO_PREWARM_STARTUP_EPISODES 首。防重入，不阻塞调用方响应。
  // 这是"播到最后一首时再加载下一批"的真正落点——prepared 才是秒切关键，
  // 不是内存 queue 的 track。
  let prewarmRefilling = false;
  function ensurePreparedEpisodes() {
    if (!prewarmRefillEnabled || prewarmRefilling) return;
    const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
    const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
    if (!currentBlock) return;
    const today = formatRadioDate(nowProvider());
    void (async () => {
      try {
        const status = await stateRepo.getBlockPrewarmStatus(today, currentBlock.at);
        if (status.ready >= env.FAKERADIO_PREWARM_LOW_WATER_MARK) return;
        prewarmRefilling = true;
        await runPrewarmForDate(
          prewarmDeps,
          today,
          [{ at: currentBlock.at, label: currentBlock.label, moodHint: currentBlock.moodHint }],
          env.FAKERADIO_PREWARM_STARTUP_EPISODES,
          systemPrompt
        );
      } catch (err) {
        console.error(`[prewarm] ensurePreparedEpisodes failed:`, err);
      } finally {
        prewarmRefilling = false;
      }
    })();
  }

  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  app.addHook("onClose", () => {
    if (snapshotTimer) clearTimeout(snapshotTimer);
  });

  function scheduleQueueSnapshot(queue = state.getQueue(), blockAt: string | null = null) {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(async () => {
      await stateRepo.snapshotQueue(queue, blockAt);
    }, 500);
  }

  async function recommendTracksForQueue(block: { at: string; label: string; moodHint: string } | null, limit: number) {
    const currentTrack = state.getCurrentTrack();
    const [weatherSnapshot, calendarItems, likedSongTracks] = await Promise.all([
      weather.current().catch(() => ({ summary: "unknown", moodHint: block?.moodHint ?? currentMoodHint })),
      calendar.upcoming().catch(() => []),
      likedSongs.list().catch(() => [])
    ]);
    const context = buildRecommendationContext({
      now: nowProvider(),
      block: block ?? {
        at: "runtime",
        label: "当前时段",
        moodHint: currentMoodHint
      },
      weather: weatherSnapshot,
      calendar: calendarItems,
      userPreferences,
      likedSongs: likedSongTracks,
      recentTrackIds: new Set([
        ...state.getRecentlySelectedTrackIds(),
        ...(currentTrack ? [currentTrack.id] : [])
      ]),
      queuedTrackIds: new Set(state.getQueue().map((track) => track.id))
    });
    const candidates = await selectRecommendedCandidates({ music: deps.music, context, limit });
    return candidates.map((candidate) => candidate.track);
  }

  // 播到最后一首时续推：固定 append 新的 count 首到队尾（区别于补差额式 refill）。
  async function appendRecommendedTracks(count = 10) {
    const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
    const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
    const recommendedRaw = await recommendTracksForQueue(currentBlock, Math.max(count * 2, 10)).catch(() => []);
    const currentQueue = state.getQueue();
    const currentTrack = state.getCurrentTrack();
    const seenIds = new Set([
      ...currentQueue.map((track) => track.id),
      ...state.getRecentlySelectedTrackIds(),
      ...(currentTrack ? [currentTrack.id] : [])
    ]);
    const fresh = recommendedRaw.filter((track) => !seenIds.has(track.id)).slice(0, count);
    if (fresh.length === 0) return currentQueue;

    const queue = [...currentQueue, ...fresh];
    state.setQueue(queue);
    stream.broadcast({ type: "queue-updated", payload: { queue } });
    scheduleQueueSnapshot(queue);
    return queue;
  }

  async function refreshRecentPlaybackMemory(): Promise<string[]> {
    const since = new Date(nowProvider().getTime() - RECENT_PLAY_EXCLUSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const persistedRecent = await stateRepo.getRecentlyPlayed(RECENT_PLAY_EXCLUSION_LIMIT, since);
    for (const played of persistedRecent.slice().reverse()) {
      state.rememberSelectedTrack({
        id: played.trackId,
        title: played.title,
        artist: played.artist,
        album: played.album ?? undefined,
        source: played.source
      });
    }
    const currentTrack = state.getCurrentTrack();
    return [
      ...new Set([
        ...state.getRecentlySelectedTrackIds(),
        ...(currentTrack ? [currentTrack.id] : []),
        ...persistedRecent.map((track) => track.trackId)
      ])
    ];
  }

  // 给定已选定的 track，组装 live episode（口播 + TTS）。
  // /api/episode/next、/api/episode/prefetch 的 live 分支与优先槽分支共用，避免三处重复。
  async function composeLiveEpisode(track: RadioEpisode["track"]) {
    const recentMemoryEntries = await memory.recent(5);
    const [playedHistory, likedSongTracks] = await Promise.all([
      stateRepo.getRecentlyPlayed(50),
      likedSongs.list().catch(() => [])
    ]);
    const personalHistory = buildPersonalHistorySnippet(track, playedHistory, likedSongTracks);
    const { episode, narration, storyTtsResult, storyType } = await composeEpisodeFromTrack(
      track,
      composeEpisodeDeps,
      {
        recentMemory: recentMemoryEntries.map((entry) => entry.content),
        taste: userPreferences.taste,
        routines: userPreferences.routines,
        moodRules: userPreferences.moodRules,
        profile: userPreferences.profile,
        personalHistory
      }
    );
    return { episode, narration, storyTtsResult, storyType };
  }

  // /api/episode/next 选定 track 后的副作用：登记、更新播放状态、广播、落库、组装 episode。
  async function finalizeNextEpisode(track: RadioEpisode["track"]) {
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    if (state.queueSize() <= 1) void appendRecommendedTracks(10).catch(() => {});
    stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
    await stateRepo.recordPlayedTrack({
      id: randomUUID(),
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      source: track.source,
      playedAt: new Date().toISOString()
    });
    const { episode, narration, storyTtsResult, storyType } = await composeLiveEpisode(track);
    state.setDj({ say: narration, audioUrl: storyTtsResult.audioUrl });
    stream.broadcast({ type: "dj-speech", payload: { text: narration, audioUrl: storyTtsResult.audioUrl } });
    const hookText = narration.split(/[。！？.!?]/)[0]?.trim();
    if (hookText && hookText.length > 0) {
      stream.broadcast({ type: "agent-message", payload: { role: "agent", text: hookText, trackId: track.id } });
    }
    await stateRepo.appendDjMessage({ text: narration, trackId: track.id, storyType, audioUrl: storyTtsResult.audioUrl });
    return EpisodeNextResponseSchema.parse({ episode, source: "live" });
  }

  // /api/episode/prefetch 选定 track 后的副作用：登记、记已选（防预取重复选同一首）、组装 episode、落口播。
  // 预取不更新"当前曲目"——前端接续播放时会调 /api/episode/playing 上报。
  async function finalizePrefetchEpisode(track: RadioEpisode["track"]) {
    trackRegistry.register(track);
    state.rememberSelectedTrack(track);
    const { episode, narration, storyTtsResult, storyType } = await composeLiveEpisode(track);
    await stateRepo.appendDjMessage({ text: narration, trackId: track.id, storyType, audioUrl: storyTtsResult.audioUrl });
    return EpisodeNextResponseSchema.parse({ episode, source: "live" });
  }

  app.get("/api/health", async () => {
    const statuses = getAdapterStatuses();
    return HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: statuses.llm,
        music: statuses.music,
        tts: statuses.tts,
        weather: statuses.weather,
        calendar: statuses.calendar,
        upnp: statuses.upnp,
        storySource: statuses.storySource,
        webResearch: statuses.webResearch
      },
      checkedAt: new Date().toISOString()
    });
  });

  app.get("/api/prewarm/status", async () => {
    const today = formatRadioDate(nowProvider());
    const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
    const blockStatus = await Promise.all(
      currentPlan.blocks.map(async (block) => {
        const counts = await stateRepo.getBlockPrewarmStatus(today, block.at);
        return {
          at: block.at,
          label: block.label,
          ready: counts.ready,
          consumed: counts.consumed,
          failed: counts.failed
        };
      })
    );
    const lastRun = await stateRepo.getPref<string>("prewarm:lastRun");
    const nextRunAt = await stateRepo.getPref<string>("prewarm:nextRunAt");
    return PrewarmStatusSchema.parse({
      enabled: env.FAKERADIO_PREWARM_ENABLED ?? false,
      targetDate: today,
      lastRun: lastRun ?? null,
      nextRunAt: nextRunAt ?? null,
      blocks: blockStatus
    });
  });

  app.get("/api/now", async () => state.buildNowResponse());

  app.get("/api/netease/login/status", async () => neteaseAuth.getStatus());

  app.post("/api/netease/login/qr", async () => neteaseAuth.createQrLogin());

  app.get<{ Params: { key: string } }>("/api/netease/login/qr/:key", async (request) => {
    return neteaseAuth.checkQrLogin(request.params.key);
  });

  app.post("/api/netease/logout", async () => neteaseAuth.logout());

  app.post("/api/netease/login/cookie", async (request) => {
    const body = NeteaseCookieSubmitRequestSchema.parse(request.body);
    await neteaseAuth.saveCookie(body.cookie);
    // 保存后立即验证：cookie 无效时如实返回失败，
    // 不再让"保存成功"伪装成"登录成功"
    const fresh = await neteaseAuth.getStatus();
    const loggedIn = fresh.loggedIn;
    return NeteaseCookieSubmitResponseSchema.parse({
      success: loggedIn,
      loggedIn,
      message: loggedIn
        ? `已登录${fresh.nickname ? ` · ${fresh.nickname}` : ""}`
        : "Cookie 已保存但验证未通过，可能已过期或格式不对，请重新获取",
      ...(fresh.nickname ? { nickname: fresh.nickname } : {})
    });
  });

  app.get("/api/next", async (_request, reply) => {
    try {
    // Detect daypart transition and refresh queue
    const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
    const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
    const blockAt = currentBlock?.at ?? null;
    if (blockAt !== null && blockAt !== state.getLastPlanBlockAt()) {
      state.setLastPlanBlockAt(blockAt);
      const excludedForQueue = await refreshRecentPlaybackMemory();
      const newQueueRaw = await recommendTracksForQueue(currentBlock, 20).catch(() => []);
      const currentQueueIds = new Set(state.getQueue().map(t => t.id));
      const newQueue = newQueueRaw.filter(t => !excludedForQueue.includes(t.id) && !currentQueueIds.has(t.id)).slice(0, 10);
      state.setQueue(newQueue);
      stream.broadcast({ type: "queue-updated", payload: { queue: newQueue } });
      scheduleQueueSnapshot(newQueue);
    }

    await refreshRecentPlaybackMemory();
    episodeRunnerDeps.musicStatus = getAdapterStatuses().music;
    const {
      track,
      decision,
      isFallback,
      candidates,
      candidateSource,
      rerankSource,
      recommendationSignals,
      recommendationQueries,
      recommendationSeedCount
    } = await resolveNextTrackAndDecision(episodeRunnerDeps);
    const { result: ttsResult } = await synthesizeWithFallback(tts, ttsCacheDir, decision.say);
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    if (state.queueSize() <= 1) void appendRecommendedTracks(10).catch(() => {});
    state.setDj({
      say: decision.say,
      audioUrl: ttsResult.audioUrl,
      segue: decision.segue
    });
    await memory.append(`playedTrack: ${track.title} - ${track.artist}`);
    const nowResponse = state.buildNowResponse();
    stream.broadcast({ type: "now-playing", payload: nowResponse });
    stream.broadcast({ type: "queue-updated", payload: { queue: state.getQueue() } });
    stream.broadcast({
      type: "dj-speech",
      payload: { text: decision.say, audioUrl: ttsResult.audioUrl }
    });

    // Proactive story hook — reuse decision text, first sentence only
    const hookText = decision.say.split(/[。！？.!?]/)[0]?.trim();
    if (hookText && hookText.length > 0) {
      stream.broadcast({
        type: "agent-message",
        payload: { role: "agent", text: hookText, trackId: track.id }
      });
    }

    return NextResponseSchema.parse({
      decision,
      track,
      queue: state.getQueue(),
      tts: ttsResult,
      diagnostics: {
        candidateSource,
        rerankSource,
        favoritesAvailable: candidates.length,
        candidatesCount: candidates.length,
        isFallback,
        musicProvider: getAdapterStatuses().music,
        signals: recommendationSignals,
        queries: recommendationQueries,
        seedCount: recommendationSeedCount
      }
    });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Music provider unavailable";
      return reply.status(503).send({ error: message });
    }
  });

  app.post("/api/chat", async (request, reply) => {
    try {
      return await handleChat(request.body, deps);
    } catch (err) {
      request.log.error({ err }, "chat handler failed");
      reply.status(500);
      return { message: "信号断了。再说一次？", decision: null };
    }
  });

  app.post("/api/chat/stream", async (request, reply) => {
    const { buildChatSSEHandler } = await import("./chat-sse-handler.js");
    const handler = buildChatSSEHandler(deps);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...getCorsHeadersForOrigin(request.headers.origin),
    });

    const emitter = {
      emit(event: "chunk" | "done", data: unknown) {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
      },
    };

    try {
      await handler((request.body as { message: string }).message, emitter);
    } catch (err) {
      request.log.error({ err }, "chat stream handler failed");
      emitter.emit("done", { text: "信号断了。再说一次？" });
    }

    reply.raw.end();
  });

  app.get("/api/taste", async () =>
    TasteResponseSchema.parse({
      taste: userPreferences.taste,
      routines: userPreferences.routines,
      playlists: userPreferences.playlists,
      moodRules: userPreferences.moodRules
    })
  );

  app.post("/api/taste/infer", async (request, reply) => {
    const todaySession = await sessionRepo.getToday();
    if (todaySession.length < 3) {
      return reply.status(400).send({ error: "今天互动不够多，暂不更新品味" });
    }

    const sessionSummary = todaySession
      .map((e) => `[${e.role}] ${e.text}${e.storyType ? ` (${e.storyType})` : ""}`)
      .join("\n");
    const favList = (await favorites.list()).map((f) => `${f.title} - ${f.artist}`).join(", ");

    const inferredTaste = await inferAndSaveTaste({
      baseDir, llm, userPreferences, sessionSummary, favList, userMessage: "分析今天的品味变化"
    });

    return { updated: true, taste: inferredTaste };
  });

  app.get("/cache/tts/*", async (request, reply) => {
    const filename = (request.params as Record<string, string>)["*"];
    if (typeof filename !== "string") return reply.status(404).send("Not found");

    const filePath = resolve(ttsCacheDir, filename);
    const relativePath = relative(resolve(ttsCacheDir), filePath);
    const fileExists = await access(filePath).then(() => true, () => false);
    if (relativePath.startsWith("..") || isAbsolute(relativePath) || !fileExists) {
      return reply.status(404).send("Not found");
    }
    if (!filePath.endsWith(".wav") && !filePath.endsWith(".mp3") && !filePath.endsWith(".m4a")) {
      return reply.status(404).send("Not found");
    }

    const mimeType = filePath.endsWith(".wav")
      ? "audio/wav"
      : filePath.endsWith(".m4a")
        ? "audio/mp4"
        : "audio/mpeg";

    // iOS/iPadOS Safari 播放音频必发 Range 请求，要求 206 Partial Content。
    // 不处理 Range 会导导致口播音频加载失败。这里手动解析 Range 并返回分片流。
    const fileStat = await stat(filePath);
    const total = fileStat.size;
    const rangeHeader = request.headers.range;
    reply.header("accept-ranges", "bytes");

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        if (start <= end && start < total) {
          return reply
            .status(206)
            .header("content-type", mimeType)
            .header("content-range", `bytes ${start}-${Math.min(end, total - 1)}/${total}`)
            .header("content-length", Math.min(end, total - 1) - start + 1)
            .send(createReadStream(filePath, { start, end }));
        }
      }
      return reply.status(416).header("content-range", `bytes */${total}`).send("Range Not Satisfiable");
    }

    return reply
      .status(200)
      .header("content-type", mimeType)
      .header("content-length", total)
      .send(createReadStream(filePath));
  });

  app.get("/api/episode/next", async (request, reply) => {
    try {
      // 1) 优先槽：用户在 DJ 聊天点"插到下一首"的曲目，最高优先级，跳过 prewarm/推荐。
      //    这是修复"DJ 说插了但没插"的关键——以前插进 queue 后被 prewarm/推荐抢先消费。
      const priorityTrack = state.getPriorityNextTrack();
      if (priorityTrack) {
        try {
          const resolved = await music.resolve(priorityTrack);
          state.consumePriorityNextTrack();
          return await finalizeNextEpisode(resolved);
        } catch {
          // resolve 失败（如网易云 URL 拿不到）：清槽，落回正常流程。
          state.consumePriorityNextTrack();
        }
      }

      // 2) Try to claim a prepared episode for the current block first
      const today = formatRadioDate(nowProvider());
      const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
      const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
      const blockAt = currentBlock?.at ?? null;

      if (blockAt !== null) {
        const excludedTrackIds = await refreshRecentPlaybackMemory();
        const claimed = await stateRepo.claimPreparedEpisode(today, blockAt, excludedTrackIds);
        if (claimed !== null) {
          const { episode } = claimed;
          trackRegistry.register(episode.track);
          state.setTrack(episode.track);
          state.rememberSelectedTrack(episode.track);
          state.removeFromQueue(episode.track.id);
          if (state.queueSize() <= 1) void appendRecommendedTracks(10).catch(() => {});
          state.setDj({ say: episode.story.text, audioUrl: episode.story.audioUrl });
          stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
          stream.broadcast({ type: "dj-speech", payload: { text: episode.story.text, audioUrl: episode.story.audioUrl } });
          const hookText = episode.story.text.split(/[。！？.!?]/)[0]?.trim();
          if (hookText && hookText.length > 0) {
            stream.broadcast({ type: "agent-message", payload: { role: "agent", text: hookText, trackId: episode.track.id } });
          }
          await stateRepo.recordPlayedTrack({
            id: randomUUID(),
            trackId: episode.track.id,
            title: episode.track.title,
            artist: episode.track.artist,
            album: episode.track.album ?? null,
            source: episode.track.source,
            playedAt: new Date().toISOString()
          });
          await stateRepo.appendDjMessage({
            text: episode.story.text,
            trackId: episode.track.id,
            storyType: episode.story.type,
            audioUrl: episode.story.audioUrl
          });
          ensurePreparedEpisodes();
          return EpisodeNextResponseSchema.parse({ episode, source: "prepared" });
        }
      }

      // 3) Fall back to live generation
      await refreshRecentPlaybackMemory();
      const { track } = await resolveNextTrackAndDecision(episodeRunnerDeps);
      if (!track) {
        throw new Error("No track available");
      }
      return await finalizeNextEpisode(track);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(503).send({ error: message });
    }
  });

  // Prefetch endpoint: 预取下一集用于秒切。优先用 prewarm 填充的 prepared episodes,
  // 没有才 fallback 到 live generation (LLM+TTS, 慢)。
  app.get("/api/episode/prefetch", async (request, reply) => {
    try {
      // 1) 优先槽：用户"插到下一首"的曲目。预取不消费槽（不清掉），
      //    等前端接续播放时 /api/episode/playing 上报后再清——
      //    这样即便预取结果被前端丢弃，优先曲目也不会丢。
      const priorityTrack = state.getPriorityNextTrack();
      if (priorityTrack) {
        try {
          const resolved = await music.resolve(priorityTrack);
          return await finalizePrefetchEpisode(resolved);
        } catch {
          // resolve 失败：清槽，避免后续预取反复重试同一首不可播的歌。
          state.consumePriorityNextTrack();
        }
      }

      // 2) 优先 claim prepared episode（秒切核心：prewarm 已生成完整 episode，无需等待）
      const today = formatRadioDate(nowProvider());
      const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
      const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
      const blockAt = currentBlock?.at ?? null;

      if (blockAt !== null) {
        const excludedTrackIds = await refreshRecentPlaybackMemory();
        const claimed = await stateRepo.claimPreparedEpisode(today, blockAt, excludedTrackIds);
        if (claimed !== null) {
          const { episode } = claimed;
          trackRegistry.register(episode.track);
          // 预取的曲目会被前端接续播放，必须登记进"最近已选"
          state.rememberSelectedTrack(episode.track);
          ensurePreparedEpisodes();
          return EpisodeNextResponseSchema.parse({ episode, source: "prepared" });
        }
      }

      // 3) 没有 prepared episode：fallback 到 live generation（慢，但保证有内容）
      await refreshRecentPlaybackMemory();
      const { track } = await resolveNextTrackAndDecision(episodeRunnerDeps);
      if (!track) {
        throw new Error("No track available");
      }
      return await finalizePrefetchEpisode(track);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(503).send({ error: message });
    }
  });

  // 前端接续播放预取 episode 时上报。预取接口不更新播放状态，
  // 不上报的话服务端的"当前曲目"会停留在上一首，DJ 聊天会聊错歌
  app.post("/api/episode/playing", async (request, reply) => {
    const { trackId } = EpisodePlayingRequestSchema.parse(request.body);
    const track = trackRegistry.get(trackId);
    if (!track) {
      return reply.status(404).send({ error: "track not found in registry" });
    }

    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    // 优先槽里的曲目此刻开始播了——只在 id 匹配时清，避免误清用户后来又插入的新歌。
    state.consumePriorityNextTrack(track.id);
    if (state.queueSize() <= 1) void appendRecommendedTracks(10).catch(() => {});
    stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
    await stateRepo.recordPlayedTrack({
      id: randomUUID(),
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      source: track.source,
      playedAt: new Date().toISOString()
    });

    return reply.send({ ok: true });
  });

  // DJ 推荐确认插入：把用户选中的曲目写入优先槽（最高播放优先级，下一首即播）。
  // 不再 push 进 queue——queue 是推荐缓冲池，会被 prewarm/推荐抢先消费，插进去的歌轮不到播。
  app.post("/api/queue/insert-next", async (request, reply) => {
    const { track } = InsertNextRequestSchema.parse(request.body);
    state.insertNext(track);
    stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
    return reply.send({ ok: true });
  });

  app.get("/api/plan/today", async () => TodayPlanResponseSchema.parse(buildTodayPlan(nowProvider(), userPreferences.playlists)));

  app.get("/api/favorites", async () => {
    const list = await favorites.list();
    return FavoritesResponseSchema.parse({ favorites: list });
  });

  app.post("/api/favorites", async (request) => {
    const body = FavoriteRequestSchema.parse(request.body);
    const entry = await favorites.save(body);
    return { favorite: entry };
  });

  app.delete("/api/favorites/:trackId", async (request, reply) => {
    const { trackId } = request.params as { trackId: string };
    const removed = await favorites.remove(trackId);
    if (!removed) return reply.status(404).send({ error: "not found" });
    return { removed: true };
  });

  app.get("/api/favorites/diagnostics", async () => {
    const diagnostics = await likedSongs.getDiagnostics();
    return LikedSongsDiagnosticsSchema.parse(diagnostics);
  });

  app.get("/api/audio/:trackId", async (request, reply) => {
    const { trackId } = request.params as { trackId: string };
    const corsHeaders = getCorsHeadersForOrigin(request.headers.origin);

    // 磁盘已有录音：从本地文件 serve，完整支持 Range。
    // iOS Safari 需要正确的 206 响应才能 seek，否则把流当直播流，
    // 重新缓冲时从头恢复（"突然从头播放"的根因）。
    const filePath = getAudioFilePath(audioDir, trackId);
    if (isAudioRecorded(audioDir, trackId)) {
      const fileExists = await access(filePath).then(() => true, () => false);
      if (fileExists) {
        const total = (await stat(filePath)).size;
        reply.headers(corsHeaders).header("accept-ranges", "bytes");
        const rangeHeader = request.headers.range;

        if (rangeHeader) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
          if (match) {
            const start = match[1] ? parseInt(match[1], 10) : 0;
            const end = match[2] ? parseInt(match[2], 10) : total - 1;
            if (start <= end && start < total) {
              return reply
                .status(206)
                .header("content-type", "audio/mpeg")
                .header("content-range", `bytes ${start}-${Math.min(end, total - 1)}/${total}`)
                .header("content-length", Math.min(end, total - 1) - start + 1)
                .send(createReadStream(filePath, { start, end }));
            }
          }
          return reply.status(416).header("content-range", `bytes */${total}`).send("Range Not Satisfiable");
        }

        return reply
          .status(200)
          .header("content-type", "audio/mpeg")
          .header("content-length", total)
          .send(createReadStream(filePath));
      }
    }

    // 首播（磁盘无录音）：走代理，透传上游 content-length，
    // iOS 有了总大小即可 seek；录完后下次播放自动走上面的磁盘 206 分支。
    try {
      const result = await proxyAndRecord({ registry: trackRegistry, audioDir, music }, trackId);
      if (!result) return reply.status(404).send({ error: "track not found or no audio URL" });
      reply.headers(corsHeaders);
      reply.header("content-type", result.response.headers.get("content-type") ?? "audio/mpeg");
      reply.header("accept-ranges", "bytes");
      const contentLength = result.response.headers.get("content-length");
      if (contentLength) reply.header("content-length", contentLength);
      return reply.send(result.response.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "audio proxy error";
      return reply.status(502).send({ error: msg });
    }
  });

  app.post("/api/export/today", async (request, reply) => {
    const taskId = startExportTask({
      favorites, trackRegistry, audioDir, exportDir, ttsCacheDir,
      getTodayPlayed: async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const played = await stateRepo.getRecentlyPlayed(200, startOfDay.toISOString());
        // 查询按时间倒序，导出节目需要按播放顺序串
        return played.reverse();
      },
      getTodayDjStories: () => stateRepo.getDjMessagesToday()
    });
    return reply.status(202).send({ taskId, status: "pending" });
  });

  app.get("/api/export/status/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = getExportTask(taskId);
    if (!task) return reply.status(404).send({ error: "task not found" });
    return task;
  });

  app.get("/api/export/download/:date", async (request, reply) => {
    const { date } = request.params as { date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: "invalid date format" });
    }
    const filePath = await getExportFilePath(exportDir, date);
    if (!filePath) return reply.status(404).send({ error: "export not found" });
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="fakeradio-${date}.zip"`)
      .send(createReadStream(filePath));
  });

  const ProjectExportBodySchema = z.object({
    includeTrace: z.boolean().optional()
  }).strict();

  app.post("/api/projects/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = ProjectExportBodySchema.parse(request.body ?? {});

    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }

    const plan = await showProjectRepo.getShowPlan(id);
    if (!plan) {
      return reply.status(400).send({ error: "no show plan found for this project" });
    }

    const jobs = await jobRegistry.list({ briefId: project.briefId });
    const completedJob = jobs.find((j) => j.status === "completed");
    if (!completedJob) {
      return reply.status(400).send({ error: "节目尚未完成生成，无法导出" });
    }

    try {
      const result = await exportShowProject({
        project,
        plan,
        job: completedJob,
        includeTrace: body?.includeTrace ?? true,
        ttsCacheDir,
      });

      await showProjectRepo.update(id, { status: "exported" });

      return reply.send(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : "export failed";
      return reply.status(500).send({ error });
    }
  });

  app.get("/api/export/project/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { file } = request.query as { file?: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }

    const allowedFiles: Record<string, string> = {
      "show-plan.json": "show-plan.json",
      "show-notes.md": "show-notes.md",
      "production-trace.jsonl": "production-trace.jsonl",
      "show.mp3": "show.mp3",
    };

    if (file && allowedFiles[file]) {
      const filePath = join(project.directoryPath, allowedFiles[file]);
      const { access } = await import("node:fs/promises");
      try {
        await access(filePath);
      } catch {
        return reply.status(404).send({ error: "file not found" });
      }
      const contentType = file.endsWith(".json") ? "application/json" : 
        file.endsWith(".md") ? "text/markdown" : 
        file.endsWith(".mp3") ? "audio/mpeg" :
        "application/jsonl";
      return reply
        .header("content-type", contentType)
        .header("content-disposition", `attachment; filename="${file}"`)
        .send(createReadStream(filePath));
    }

    const { readdir } = await import("node:fs/promises");
    let files: string[] = [];
    try {
      files = await readdir(project.directoryPath);
    } catch {
    }
    const available = files.filter((f) => allowedFiles[f]);
    if (available.length === 0) {
      return reply.status(404).send({ error: "no export files found" });
    }
    return reply.send({ projectId: id, files: available });
  });

  registerShowRoutes({
    app, programBriefRepo, showPlanRepo, showProjectRepo, jobRegistry,
    showPlanGenerator, dailyShowPlanGenerator, nowProvider, userPreferences,
    llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, likedSongs, systemPrompt
  });

  registerSettingsRoutes({ app, stateRepo, runtimeManager, ttsCacheDir });

  app.get("/stream", { websocket: true }, (connection) => {
    const removeClient = stream.add(connection);
    connection.on("close", removeClient);
    connection.send(JSON.stringify(StreamEventSchema.parse({
      type: "diagnostic",
      payload: { level: "info", message: "FakeRadio stream connected", at: new Date().toISOString() }
    })));
  });
}
