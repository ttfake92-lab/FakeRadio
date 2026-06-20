import { z } from "zod";
import {
  EpisodeNextResponseSchema,
  EpisodePlayingRequestSchema,
  FavoriteRequestSchema,
  FavoritesResponseSchema,
  HealthResponseSchema,
  LikedSongsDiagnosticsSchema,
  NeteaseCookieSubmitRequestSchema,
  NeteaseCookieSubmitResponseSchema,
  NextResponseSchema,
  PrewarmStatusSchema,
  StreamEventSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  BriefsListResponseSchema,
  BriefResponseSchema,
  ShowPlansListResponseSchema,
  ShowPlanResponseSchema,
  ShowJobsListResponseSchema,
  ShowJobResponseSchema,
  StartJobRequestSchema,
  GenerateNowRequestSchema,
  GenerateNowResponseSchema,
  ScheduleTonightRequestSchema,
  ScheduleTonightResponseSchema,
  AddConstraintsRequestSchema,
  ShowProjectsListResponseSchema,
  ShowProjectResponseSchema,
  SettingsSchema,
  SettingsResponseSchema,
  UpdateSettingsRequestSchema,
  type RadioEpisode,
  type ProgramBrief,
  type ShowPlan,
  type Settings
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
import { executeScheduledJob, type SchedulerExecutionDeps } from "../show/scheduler-integration.js";
import type { PlaybackState } from "./playback-state.js";
import { resolveNextTrackAndDecision, synthesizeWithFallback, gatherEpisodeSources, narrateStoryWithSources, type EpisodeRunnerDeps } from "./episode-runner.js";
import { handleChat } from "./chat-intent-router.js";
import type { RegisterRoutesDeps } from "./types.js";

function serializeProject<T>(project: T): T {
  return project;
}

const LOCAL_WEB_ORIGINS = new Set([
  "http://localhost:3302",
  "http://127.0.0.1:3302",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

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
    showPlanRepo, showPlanGenerator, dailyShowPlanGenerator, jobRegistry, showProjectRepo
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

  async function ensureQueueSize(targetSize = 10) {
    const currentQueue = state.getQueue();
    if (currentQueue.length >= targetSize) return currentQueue;

    const refillRaw = await deps.music.recommend({ mood: currentMoodHint, limit: Math.max(targetSize * 2, 10) }).catch(() => []);
    const currentTrack = state.getCurrentTrack();
    const excludedForRefill = new Set([
      ...state.getRecentlySelectedTrackIds(),
      ...(currentTrack ? [currentTrack.id] : []),
      ...currentQueue.map((track) => track.id)
    ]);
    const refill = refillRaw
      .filter((track) => !excludedForRefill.has(track.id))
      .slice(0, targetSize - currentQueue.length);
    if (refill.length === 0) return currentQueue;

    const queue = [...currentQueue, ...refill];
    state.setQueue(queue);
    stream.broadcast({ type: "queue-updated", payload: { queue } });
    scheduleQueueSnapshot(queue);
    return queue;
  }

  async function refreshRecentPlaybackMemory(): Promise<string[]> {
    const persistedRecent = await stateRepo.getRecentlyPlayed(30);
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
    return NeteaseCookieSubmitResponseSchema.parse({
      success: true,
      message: "Cookie 已保存并生效"
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
      const newQueueRaw = await deps.music.recommend({ mood: currentBlock?.moodHint ?? currentMoodHint, limit: 20 }).catch(() => []);
      const excludedForQueue = await refreshRecentPlaybackMemory();
      const currentQueueIds = new Set(state.getQueue().map(t => t.id));
      const newQueue = newQueueRaw.filter(t => !excludedForQueue.includes(t.id) && !currentQueueIds.has(t.id)).slice(0, 10);
      state.setQueue(newQueue);
      stream.broadcast({ type: "queue-updated", payload: { queue: newQueue } });
      scheduleQueueSnapshot(newQueue);
    }

    await refreshRecentPlaybackMemory();
    episodeRunnerDeps.musicStatus = getAdapterStatuses().music;
    const { track, decision, isFallback, candidates, candidateSource, rerankSource } = await resolveNextTrackAndDecision(episodeRunnerDeps);
    const { result: ttsResult } = await synthesizeWithFallback(tts, ttsCacheDir, decision.say);
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    if (state.queueSize() < 2) await ensureQueueSize(10);
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
        musicProvider: getAdapterStatuses().music
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
      // Try to claim a prepared episode for the current block first
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
          if (state.queueSize() < 2) await ensureQueueSize(10);
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
          return EpisodeNextResponseSchema.parse({ episode, source: "prepared" });
        }
      }

      // Fall back to live generation
      await refreshRecentPlaybackMemory();
      const { track, decision } = await resolveNextTrackAndDecision(episodeRunnerDeps);
      if (!track) {
        throw new Error("No track available");
      }
      trackRegistry.register(track);
      state.setTrack(track);
      state.rememberSelectedTrack(track);
      state.removeFromQueue(track.id);
      if (state.queueSize() < 2) await ensureQueueSize(10);
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

      const sources = await gatherEpisodeSources(
        storySource, publicMetadataAdapter, webResearchAdapter, env.FAKERADIO_BRAVE_API_KEY, track
      );

      const [weatherSnapshot, calendarItems, playbackDevices, recentMemoryEntries] = await Promise.all([
        weather.current(),
        calendar.upcoming(),
        devices.list(),
        memory.recent(5)
      ]);
      const contextEnv = { weather: weatherSnapshot, calendar: calendarItems, devices: playbackDevices };

      const { narration, storyType } = await narrateStoryWithSources(
        llm,
        track,
        sources,
        systemPrompt,
        recentMemoryEntries.map((entry) => entry.content),
        contextEnv,
        userPreferences.taste,
        userPreferences.routines,
        userPreferences.moodRules
      );

      const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(tts, ttsCacheDir, narration);

      const episode: RadioEpisode = {
        track,
        story: { text: narration, audioUrl: storyTtsResult.audioUrl, type: storyType },
        sources,
        playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 },
        fallbackReason
      };
      state.setDj({ say: narration, audioUrl: storyTtsResult.audioUrl });
      stream.broadcast({ type: "dj-speech", payload: { text: narration, audioUrl: storyTtsResult.audioUrl } });
      const hookText2 = narration.split(/[。！？.!?]/)[0]?.trim();
      if (hookText2 && hookText2.length > 0) {
        stream.broadcast({ type: "agent-message", payload: { role: "agent", text: hookText2, trackId: track.id } });
      }
      await stateRepo.appendDjMessage({ text: narration, trackId: track.id, storyType: storyType, audioUrl: storyTtsResult.audioUrl });

      return EpisodeNextResponseSchema.parse({ episode, source: "live" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(503).send({ error: message });
    }
  });

  // Prefetch endpoint: generates episode without updating playback state
  app.get("/api/episode/prefetch", async (request, reply) => {
    try {
      await refreshRecentPlaybackMemory();
      const { track, decision } = await resolveNextTrackAndDecision(episodeRunnerDeps);
      if (!track) {
        throw new Error("No track available");
      }
      // Register track for audio proxying but don't update playback state
      trackRegistry.register(track);
      // 预取的曲目会被前端接续播放，必须登记进"最近已选"，
      // 否则下一次预取会再次选中同一首，导致每首歌播两遍
      state.rememberSelectedTrack(track);

      const sources = await gatherEpisodeSources(
        storySource, publicMetadataAdapter, webResearchAdapter, env.FAKERADIO_BRAVE_API_KEY, track
      );

      const [weatherSnapshot, calendarItems, playbackDevices, recentMemoryEntries] = await Promise.all([
        weather.current(),
        calendar.upcoming(),
        devices.list(),
        memory.recent(5)
      ]);
      const contextEnv = { weather: weatherSnapshot, calendar: calendarItems, devices: playbackDevices };

      const { narration, storyType } = await narrateStoryWithSources(
        llm,
        track,
        sources,
        systemPrompt,
        recentMemoryEntries.map((entry) => entry.content),
        contextEnv,
        userPreferences.taste,
        userPreferences.routines,
        userPreferences.moodRules
      );

      const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(tts, ttsCacheDir, narration);

      const episode: RadioEpisode = {
        track,
        story: { text: narration, audioUrl: storyTtsResult.audioUrl, type: storyType },
        sources,
        playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 },
        fallbackReason
      };

      // 预取的 episode 大概率会被前端接续播放，口播记录（含音频路径）
      // 要进 dj_messages，否则当日导出无法为这些歌混入口播
      await stateRepo.appendDjMessage({ text: narration, trackId: track.id, storyType, audioUrl: storyTtsResult.audioUrl });

      return EpisodeNextResponseSchema.parse({ episode, source: "live" });
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
    if (state.queueSize() < 2) await ensureQueueSize(10);
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

  app.get("/api/briefs", async (_request, reply) => {
    const briefs = await programBriefRepo.list();
    return reply.send(BriefsListResponseSchema.parse({ briefs }));
  });

  app.get("/api/briefs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const brief = await programBriefRepo.get(id);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }
    return reply.send(BriefResponseSchema.parse({ brief }));
  });

  app.get("/api/plans", async (request, reply) => {
    const { briefId } = request.query as { briefId?: string };
    const plans = await showPlanRepo.list(briefId ? { briefId } : undefined);
    return reply.send(ShowPlansListResponseSchema.parse({ plans }));
  });

  app.get("/api/plans/:briefId", async (request, reply) => {
    const { briefId } = request.params as { briefId: string };
    const plans = await showPlanRepo.list({ briefId, activeOnly: false });
    return reply.send(ShowPlansListResponseSchema.parse({ plans }));
  });

  app.get("/api/plans/:briefId/active", async (request, reply) => {
    const { briefId } = request.params as { briefId: string };
    const plans = await showPlanRepo.list({ briefId, activeOnly: true });
    const activePlan = plans[0];
    if (!activePlan) {
      return reply.status(404).send({ error: "no active plan found for this brief" });
    }
    return reply.send(ShowPlanResponseSchema.parse({ plan: activePlan }));
  });

  app.post("/api/plans/add-constraints", async (request, reply) => {
    const body = AddConstraintsRequestSchema.parse(request.body);
    const planId = body.planId;
    const constraints = body.constraints;

    const existingPlan = await showPlanRepo.get(planId);
    if (!existingPlan) {
      return reply.status(404).send({ error: "plan not found" });
    }

    const brief = await programBriefRepo.get(existingPlan.briefId);
    const newPlan = await showPlanGenerator.generateFromPlan(
      existingPlan,
      brief ?? existingPlan.briefSnapshot,
      constraints as { preferEra?: string; avoidExplicit?: boolean; moodHint?: string } ?? {}
    );

    await showPlanRepo.save(newPlan);

    return reply.send({ plan: newPlan });
  });

  app.post("/api/jobs", async (request, reply) => {
    const body = StartJobRequestSchema.parse(request.body);
    const job = await jobRegistry.create({ briefId: body.briefId, planId: body.planId });
    await jobRegistry.addLog(job.id, { level: "info", message: "Job created", phase: "init" });
    return reply.status(201).send(ShowJobResponseSchema.parse({ job }));
  });

  app.get("/api/jobs", async (request, reply) => {
    const { briefId } = request.query as { briefId?: string };
    const jobs = await jobRegistry.list(briefId ? { briefId } : undefined);
    return reply.send(ShowJobsListResponseSchema.parse({ jobs }));
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.get(id);
    if (!job) {
      return reply.status(404).send({ error: "job not found" });
    }
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/start", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingJob = await jobRegistry.get(id);
    if (!existingJob) {
      return reply.status(400).send({ error: "cannot start job (not found)" });
    }

    const wasNeedsReplan = existingJob.status === "needs-replan";
    const job = await jobRegistry.start(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot start job (invalid state transition)" });
    }

    if (wasNeedsReplan) {
      const executionDeps: SchedulerExecutionDeps = {
        briefRepo: programBriefRepo,
        planRepo: showPlanRepo,
        showProjectRepo,
        jobRegistry,
        llm,
        music,
        tts,
        ttsCacheDir,
        weather,
        calendar,
        devices,
        storySource,
        publicMetadataAdapter,
        webResearchAdapter,
        likedSongs,
        systemPrompt,
        userPreferences
      };

      await programBriefRepo.updateStatus(job.briefId, "generating");
      await executeScheduledJob(executionDeps, job.briefId, job.planId, job.id);

      const finalJob = await jobRegistry.get(job.id);
      const updatedJob = finalJob ?? job;

      await jobRegistry.addLog(job.id, { level: "info", message: "Job restarted from needs-replan", phase: "running" });
      return reply.send(ShowJobResponseSchema.parse({ job: updatedJob }));
    }

    await jobRegistry.addLog(job.id, { level: "info", message: "Job started", phase: "running" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.pause(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot pause job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "info", message: "Job paused", phase: "paused" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.resume(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot resume job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "info", message: "Job resumed", phase: "running" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.cancel(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot cancel job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "warn", message: "Job cancelled", phase: "cancelled" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  const NeedsReplanBodySchema = z.object({
    reason: z.string().optional()
  }).strict();

  app.post("/api/jobs/:id/needs-replan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = NeedsReplanBodySchema.parse(request.body ?? {});
    const reason = body.reason ?? "User requested replan";
    const job = await jobRegistry.markNeedsReplan(id, reason);
    if (!job) {
      return reply.status(400).send({ error: "cannot mark job as needs-replan (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "warn", message: `Job needs replan: ${reason}`, phase: "needs-replan" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  // Show Projects API
  app.get("/api/shows", async (_request, reply) => {
    const projects = await showProjectRepo.list();
    return reply.send(ShowProjectsListResponseSchema.parse({ projects: projects.map(serializeProject) }));
  });

  app.get("/api/shows/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    return reply.send(ShowProjectResponseSchema.parse({ project: serializeProject(project) }));
  });

  app.delete("/api/shows/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    await showProjectRepo.delete(id);
    return reply.send({ success: true });
  });

  app.delete("/api/shows/:id/trace", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    await showProjectRepo.deleteTrace(id);
    return reply.send({ success: true });
  });

  // Generate Now API
  app.post("/api/shows/generate-now", async (request, reply) => {
    const body = GenerateNowRequestSchema.parse(request.body);
    const brief = await programBriefRepo.get(body.briefId);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }

    // Check if there's an existing project for this brief
    let project = await showProjectRepo.getByBriefId(brief.id);
    if (!project) {
      // Create a new project
      const slug = `${formatRadioDate(nowProvider())}-${brief.topic ? brief.topic.toLowerCase().replace(/\s+/g, "-") : "show"}`;
      project = await showProjectRepo.create({ briefId: brief.id, slug });
    }

    const runningStatuses = new Set(["pending", "running", "paused", "needs-replan"]);
    const existingJobs = await jobRegistry.list({ briefId: brief.id });
    const reusableJob = existingJobs.find((job) => runningStatuses.has(job.status));
    if (reusableJob) {
      project = await showProjectRepo.update(project.id, {
        activeJobId: reusableJob.id,
        status: "generating"
      }) ?? project;
      await jobRegistry.addLog(reusableJob.id, {
        level: "info",
        message: "Generate-now request reused existing active job",
        phase: "init"
      });
      const refreshedJob = await jobRegistry.get(reusableJob.id);
      return reply.status(202).send(GenerateNowResponseSchema.parse({
        project,
        job: refreshedJob ?? reusableJob
      }));
    }

    // Check if there's an active plan, if not create one
    let plans = await showPlanRepo.list({ briefId: brief.id, activeOnly: true });
    let activePlan = plans[0];
    if (!activePlan) {
      const draftPlan = brief.type === "daily-show" 
        ? await dailyShowPlanGenerator.generate(brief) 
        : await showPlanGenerator.generate(brief, userPreferences.taste);
      activePlan = await showPlanRepo.save(draftPlan);
    }

    // Update project with active plan
    project = await showProjectRepo.update(project.id, {
      activePlanId: activePlan.id,
      status: "generating"
    }) ?? project;

    // Save show plan to project
    await showProjectRepo.saveShowPlan(project.id, activePlan);

    // Create and start job
    const job = await jobRegistry.create({ briefId: brief.id, planId: activePlan.id });
    await jobRegistry.addLog(job.id, { level: "info", message: "Job created for generate-now", phase: "init" });
    const startedJob = await jobRegistry.start(job.id);
    if (startedJob) {
      await jobRegistry.addLog(startedJob.id, { level: "info", message: "Job started immediately", phase: "running" });
    }

    const targetJobId = startedJob?.id ?? job.id;

    // Update project with active job
    project = await showProjectRepo.update(project.id, {
      activeJobId: targetJobId
    }) ?? project;

    await showProjectRepo.appendTrace(project.id, {
      type: "job-started",
      jobId: targetJobId,
      briefId: brief.id,
      planId: activePlan.id,
      status: "generating"
    });

    // Execute the scheduled job to generate episodes
    try {
      const executionDeps: SchedulerExecutionDeps = {
        briefRepo: programBriefRepo,
        planRepo: showPlanRepo,
        showProjectRepo,
        jobRegistry,
        llm,
        music,
        tts,
        ttsCacheDir,
        weather,
        calendar,
        devices,
        storySource,
        publicMetadataAdapter: publicMetadataAdapter,
        webResearchAdapter: webResearchAdapter,
        likedSongs,
        systemPrompt,
        userPreferences
      };

      await programBriefRepo.updateStatus(brief.id, "generating");
      await executeScheduledJob(executionDeps, brief.id, activePlan.id, targetJobId);

      const finalJob = await jobRegistry.get(targetJobId);
      const projectWithTrace = await showProjectRepo.get(project.id);

      if (finalJob && (finalJob.status === "completed" || finalJob.status === "failed")) {
        await showProjectRepo.update(project.id, {
          status: finalJob.status === "completed" ? "ready" : "failed"
        });
        if (finalJob.status === "completed") {
          await programBriefRepo.updateStatus(brief.id, "completed");
        }
      }

      const updatedProject = await showProjectRepo.get(project.id);

      return reply.status(201).send(GenerateNowResponseSchema.parse({
        project: updatedProject ?? projectWithTrace ?? project,
        job: finalJob ?? startedJob ?? job
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "unknown error";
      await jobRegistry.addLog(targetJobId, { level: "error", message: `executeScheduledJob failed: ${errorMsg}`, phase: "execution" });
      await jobRegistry.fail(targetJobId, errorMsg);
      await programBriefRepo.updateStatus(brief.id, "failed");

      const failedJob = await jobRegistry.get(targetJobId);
      await showProjectRepo.update(project.id, { status: "failed" });
      const projectWithTrace = await showProjectRepo.get(project.id);

      return reply.status(500).send(GenerateNowResponseSchema.parse({
        project: projectWithTrace ?? project,
        job: failedJob ?? startedJob ?? job
      }));
    }
  });

  // Schedule Tonight API
  app.post("/api/shows/schedule-tonight", async (request, reply) => {
    const body = ScheduleTonightRequestSchema.parse(request.body);
    const brief = await programBriefRepo.get(body.briefId);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }

    // Check if there's an existing project for this brief
    let project = await showProjectRepo.getByBriefId(brief.id);
    if (!project) {
      // Create a new project
      const slug = `${formatRadioDate(nowProvider())}-${brief.topic ? brief.topic.toLowerCase().replace(/\s+/g, "-") : "show"}`;
      project = await showProjectRepo.create({ briefId: brief.id, slug });
    }

    // Check if there's an active plan, if not create one
    let plans = await showPlanRepo.list({ briefId: brief.id, activeOnly: true });
    let activePlan = plans[0];
    if (!activePlan) {
      const draftPlan = brief.type === "daily-show" 
        ? await dailyShowPlanGenerator.generate(brief) 
        : await showPlanGenerator.generate(brief, userPreferences.taste);
      activePlan = await showPlanRepo.save(draftPlan);
    }

    // Update project with active plan
    project = await showProjectRepo.update(project.id, { 
      activePlanId: activePlan.id,
      status: "draft"
    }) ?? project;

    // Save show plan to project
    await showProjectRepo.saveShowPlan(project.id, activePlan);

    // Update brief to scheduled
    const updatedBrief = await programBriefRepo.update(brief.id, { status: "scheduled" });

    const scheduledAt = nowProvider().toISOString();

    await showProjectRepo.appendTrace(project.id, {
      type: "scheduled",
      briefId: brief.id,
      planId: activePlan.id,
      scheduledAt
    });

    const projectWithTrace = await showProjectRepo.get(project.id);

    return reply.status(201).send(ScheduleTonightResponseSchema.parse({
      project: projectWithTrace ?? project,
      brief: updatedBrief ?? brief,
      scheduledAt
    }));
  });

  app.get("/api/settings", async (_request, reply) => {
    return reply.send(SettingsResponseSchema.parse({
      settings: runtimeManager?.getSettings() ?? SettingsSchema.parse({})
    }));
  });

  app.put("/api/settings", async (request, reply) => {
    const body = UpdateSettingsRequestSchema.parse(request.body);
    const currentSettings = runtimeManager?.getSettings() ?? await stateRepo.getPref<Settings>("show:settings") ?? {};
    const mergedSettings = SettingsSchema.parse({
      ...currentSettings,
      ...body
    });
    if (runtimeManager) {
      try {
        await runtimeManager.applySettings(mergedSettings);
      } catch (err) {
        const message = err instanceof Error ? err.message : "设置应用失败";
        return reply.status(503).send({ error: message });
      }
    }
    await stateRepo.upsertPref("show:settings", mergedSettings);
    return reply.send(SettingsResponseSchema.parse({ settings: mergedSettings }));
  });

  app.get("/stream", { websocket: true }, (connection) => {
    const removeClient = stream.add(connection);
    connection.on("close", removeClient);
    connection.send(JSON.stringify(StreamEventSchema.parse({
      type: "diagnostic",
      payload: { level: "info", message: "FakeRadio stream connected", at: new Date().toISOString() }
    })));
  });
}
