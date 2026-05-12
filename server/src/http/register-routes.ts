import {
  EpisodeNextResponseSchema,
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
  type RadioEpisode
} from "@fakeradio/shared";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { formatRadioDate } from "../utils/time.js";
import { proxyAndRecord } from "../audio/audio-recorder.js";
import { startExportTask, getExportTask, getExportFilePath } from "../export/export-pipeline.js";
import { inferAndSaveTaste } from "../user/taste-inferer.js";
import type { PlaybackState } from "./playback-state.js";
import { resolveNextTrackAndDecision, synthesizeWithFallback, gatherEpisodeSources, narrateStoryWithSources, type EpisodeRunnerDeps } from "./episode-runner.js";
import { handleChat } from "./chat-intent-router.js";
import type { RegisterRoutesDeps } from "./types.js";

export function registerRoutes(deps: RegisterRoutesDeps) {
  const {
    app, state, stateRepo, stream, memory, favorites, likedSongs, sessionRepo, trackRegistry, audioDir, exportDir, llm, llmStatus, music, musicStatus, ttsStatus, tts, ttsCacheDir,
    systemPrompt, userPreferences, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, currentMoodHint, nowProvider,
    storySourceStatus, webResearchStatus, neteaseAuth, baseDir
  } = deps;

  const episodeRunnerDeps: EpisodeRunnerDeps = {
    llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource,
    publicMetadataAdapter, webResearchAdapter, memory, state, systemPrompt,
    userPreferences, musicStatus, currentMoodHint, nowProvider, likedSongs
  };

  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  app.addHook("onClose", () => {
    if (snapshotTimer) clearTimeout(snapshotTimer);
  });

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

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: llmStatus,
        music: musicStatus,
        tts: ttsStatus,
        weather: "mock",
        calendar: "mock",
        upnp: "mock",
        storySource: storySourceStatus,
        webResearch: webResearchStatus
      },
      checkedAt: new Date().toISOString()
    })
  );

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

  app.get("/api/next", async () => {
    // Detect daypart transition and refresh queue
    const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
    const currentBlock = getCurrentPlanBlock(currentPlan, nowProvider());
    const blockAt = currentBlock?.at ?? null;
    if (blockAt !== null && blockAt !== state.getLastPlanBlockAt()) {
      state.setLastPlanBlockAt(blockAt);
      const newQueue = await deps.music.recommend({ mood: currentBlock?.moodHint ?? currentMoodHint, limit: 3 });
      state.setQueue(newQueue);
      stream.broadcast({ type: "queue-updated", payload: { queue: newQueue } });
      if (snapshotTimer) clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(async () => {
        await stateRepo.snapshotQueue(newQueue, null);
      }, 500);
    }

    await refreshRecentPlaybackMemory();
    const { track, decision, isFallback, candidates, candidateSource, rerankSource } = await resolveNextTrackAndDecision(episodeRunnerDeps);
    const { result: ttsResult } = await synthesizeWithFallback(tts, ttsCacheDir, decision.say);
    trackRegistry.register(track);
    state.setTrack(track);
    state.rememberSelectedTrack(track);
    state.removeFromQueue(track.id);
    if (state.queueSize() < 2) {
      const refill = await deps.music.recommend({ mood: currentMoodHint, limit: 3 });
      const queue = [...state.getQueue(), ...refill];
      state.setQueue(queue);
      if (snapshotTimer) clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(async () => {
        await stateRepo.snapshotQueue(queue, null);
      }, 500);
    }
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
        musicProvider: deps.musicStatus
      }
    });
  });

  app.post("/api/chat", async (request) => handleChat(request.body, deps));

  app.post("/api/chat/stream", async (request, reply) => {
    const { buildChatSSEHandler } = await import("./chat-sse-handler.js");
    const handler = buildChatSSEHandler(deps);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
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

    const mimeType = filePath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
    return reply.type(mimeType).send(createReadStream(filePath));
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
          stream.broadcast({ type: "now-playing", payload: state.buildNowResponse() });
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
            storyType: episode.story.type
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
      await stateRepo.appendDjMessage({ text: narration, trackId: track.id, storyType: storyType });

      return EpisodeNextResponseSchema.parse({ episode, source: "live" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({ error: message });
    }
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
    try {
      const result = await proxyAndRecord({ registry: trackRegistry, audioDir }, trackId);
      if (!result) return reply.status(404).send({ error: "track not found or no audio URL" });
      return reply
        .header("content-type", result.response.headers.get("content-type") ?? "audio/mpeg")
        .send(result.response.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "audio proxy error";
      return reply.status(502).send({ error: msg });
    }
  });

  app.post("/api/export/today", async (request, reply) => {
    const taskId = startExportTask({
      favorites, trackRegistry, audioDir, exportDir, ttsCacheDir
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

  app.get("/stream", { websocket: true }, (connection) => {
    const removeClient = stream.add(connection);
    connection.on("close", removeClient);
    connection.send(JSON.stringify(StreamEventSchema.parse({
      type: "diagnostic",
      payload: { level: "info", message: "FakeRadio stream connected", at: new Date().toISOString() }
    })));
  });
}
