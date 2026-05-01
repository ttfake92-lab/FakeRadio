import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  EpisodeNextResponseSchema,
  HealthResponseSchema,
  NextResponseSchema,
  NowResponseSchema,
  StreamEventSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  type NowResponse,
  type RadioEpisode,
  type Track,
  type TtsResult
} from "@fakeradio/shared";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMusicAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockStorySourceAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter,
  createEdgeTtsAdapter,
  createPublicMetadataAdapter,
  createWebResearchAdapter
} from "../adapters/index.js";
import { createReadStream, existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { CalendarAdapter, DeviceAdapter, StorySourceAdapter, TtsAdapter, WeatherAdapter } from "../adapters/types.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { env } from "../config/env.js";
import { createStreamBroadcaster } from "../realtime/stream-bus.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { createInMemoryMemoryRepository } from "../state/memory-repository.js";
import { loadUserPreferences, type UserPreferences } from "../user/load-user-preference.js";

type CreateRadioServerOptions = {
  musicAdapterResult?: Awaited<ReturnType<typeof createMusicAdapter>>;
  now?: () => Date;
  ttsAdapter?: TtsAdapter;
  ttsCacheDir?: string;
  weatherAdapter?: WeatherAdapter;
  calendarAdapter?: CalendarAdapter;
  deviceAdapter?: DeviceAdapter;
  storySourceAdapter?: StorySourceAdapter;
  publicMetadataAdapter?: StorySourceAdapter;
  webResearchAdapter?: StorySourceAdapter;
  userPreferences?: UserPreferences;
};

export async function createRadioServer(options: CreateRadioServerOptions = {}) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
  });
  await app.register(websocket);

  const llm = createMockLlmAdapter();
  const ttsCacheDir = options.ttsCacheDir ?? resolve(process.cwd(), env.FAKERADIO_TTS_CACHE_DIR);
  const { music, status: musicStatus } =
    options.musicAdapterResult ??
    (await createMusicAdapter({
      providerMode: env.FAKERADIO_PROVIDER_MODE,
      baseUrl: env.FAKERADIO_NETEASE_API_BASE_URL,
      timeoutMs: env.FAKERADIO_NETEASE_TIMEOUT_MS
    }));
  const tts =
    options.ttsAdapter ??
    createEdgeTtsAdapter({
      cacheDir: ttsCacheDir,
      voice: env.FAKERADIO_TTS_VOICE
    });
  const weather = options.weatherAdapter ?? createMockWeatherAdapter();
  const calendar = options.calendarAdapter ?? createMockCalendarAdapter();
  const devices = options.deviceAdapter ?? createMockDeviceAdapter();
  const storySource = options.storySourceAdapter ?? createMockStorySourceAdapter();
  const stream = createStreamBroadcaster();
  const memory = createInMemoryMemoryRepository();
  const nowProvider = options.now ?? (() => new Date());
  let currentTrack: Track | null = null;
  let currentDj: NowResponse["dj"] = {
    say: "FakeRadio 准备好了。"
  };
  let recentlySelectedTrackIds: string[] = [];
  const userPreferences = options.userPreferences ?? (await loadUserPreferences());

  const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
  const currentPlanBlock = getCurrentPlanBlock(currentPlan, nowProvider());
  const currentMoodHint = currentPlanBlock?.moodHint ?? "warm morning indie";
  const queue = await music.recommend({ mood: currentMoodHint, limit: 3 });

  const buildNowResponse = () =>
    NowResponseSchema.parse({
      playback: currentTrack ? "playing" : "idle",
      track: currentTrack,
      dj: currentDj,
      queue,
      updatedAt: new Date().toISOString()
    });

  const rememberSelectedTrack = (track: Track) => {
    recentlySelectedTrackIds = [
      track.id,
      ...recentlySelectedTrackIds.filter((id) => id !== track.id)
    ].slice(0, 10);
  };

  const selectCandidate = (tracks: Track[]) => {
    const excludedTrackIds = new Set([
      ...recentlySelectedTrackIds,
      ...(currentTrack ? [currentTrack.id] : [])
    ]);
    return tracks.find((track) => !excludedTrackIds.has(track.id)) ?? tracks[0];
  };

  const synthesizeWithFallback = async (text: string): Promise<{ result: TtsResult; fallbackReason?: string }> => {
    try {
      return { result: await tts.synthesize(text) };
    } catch (error) {
      console.error("TTS synthesis failed, falling back to mock:", error);
      const mockTts = createMockTtsAdapter({ cacheDir: ttsCacheDir });
      return {
        result: await mockTts.synthesize(text),
        fallbackReason: "TTS synthesis failed; fell back to mock TTS"
      };
    }
  };

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: "mock",
        music: musicStatus,
        tts: options.ttsAdapter ? "mock" : "ready",
        weather: "mock",
        calendar: "mock",
        upnp: "mock",
        storySource: options.storySourceAdapter ? "ready" : "mock",
        webResearch: options.webResearchAdapter || env.FAKERADIO_BRAVE_API_KEY ? "ready" : "disabled"
      },
      checkedAt: new Date().toISOString()
    })
  );

  app.get("/api/now", async () => buildNowResponse());

  async function resolveNextTrackAndDecision() {
    const now = nowProvider();
    const weatherSnapshot = await weather.current();
    const calendarItems = await calendar.upcoming();
    const playbackDevices = await devices.list();
    const recentMemoryEntries = await memory.recent(5);

    const draftDecision = await computeDjDecision({
      llm,
      now,
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: userPreferences.taste,
      routines: userPreferences.routines,
      moodRules: userPreferences.moodRules,
      recentMemory: recentMemoryEntries.map((entry) => entry.content),
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: weatherSnapshot,
        calendar: calendarItems,
        devices: playbackDevices
      }
    });

    const candidates = await music.search(draftDecision.play.query ?? currentMoodHint);
    let track: Track;

    const candidate = selectCandidate(candidates);
    const queueCandidate = selectCandidate(queue);

    if (candidate) {
      track = await music.resolve(candidate);
    } else if (queueCandidate) {
      track = await music.resolve(queueCandidate);
    } else {
      const mockMusic = createMockMusicAdapter();
      const fallbackTracks = await mockMusic.search(currentMoodHint);
      track = await mockMusic.resolve(fallbackTracks[0]!);
    }

    const isFallback = candidates.length === 0 && queue.length === 0;

    const decision = await computeDjDecision({
      llm,
      now,
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: userPreferences.taste,
      routines: userPreferences.routines,
      moodRules: userPreferences.moodRules,
      recentMemory: recentMemoryEntries.map((entry) => entry.content),
      toolResults: [
        `music.provider: ${musicStatus}`,
        `music.search returned ${candidates.length} tracks`,
        ...(isFallback ? ["music.fallback: used mock adapter due to empty results"] : []),
        `music.selectedTrack: ${track.title} - ${track.artist}`,
        ...queue.map((item, index) => `music.queue[${index}]: ${item.title} - ${item.artist}`)
      ],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: weatherSnapshot,
        calendar: calendarItems,
        devices: playbackDevices
      }
    });

    return { track, decision, isFallback, candidates };
  }

  app.get("/api/next", async () => {
    const { track, decision } = await resolveNextTrackAndDecision();
    const { result: ttsResult } = await synthesizeWithFallback(decision.say);
    currentTrack = track;
    rememberSelectedTrack(track);
    currentDj = {
      say: decision.say,
      audioUrl: ttsResult.audioUrl,
      segue: decision.segue
    };
    await memory.append(`playedTrack: ${track.title} - ${track.artist}`);
    const nowResponse = buildNowResponse();
    stream.broadcast({ type: "now-playing", payload: nowResponse });
    stream.broadcast({ type: "queue-updated", payload: { queue } });
    stream.broadcast({
      type: "dj-speech",
      payload: {
        text: decision.say,
        audioUrl: ttsResult.audioUrl
      }
    });

    return NextResponseSchema.parse({
      decision,
      track,
      queue,
      tts: ttsResult
    });
  });

  app.post("/api/chat", async (request) => {
    const body = ChatRequestSchema.parse(request.body);
    const decision = await computeDjDecision({
      llm,
      now: new Date(),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: userPreferences.taste,
      routines: userPreferences.routines,
      moodRules: userPreferences.moodRules,
      recentMemory: [],
      userMessage: body.message,
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: { summary: "mock weather", moodHint: "mock" },
        calendar: [{ title: "mock calendar", start: "09:00", end: "10:00" }],
        devices: [{ id: "local-browser", name: "Local Browser", kind: "browser", status: "available" }]
      }
    });

    return ChatResponseSchema.parse({
      message: decision.say,
      decision
    });
  });

  app.get("/api/taste", async () =>
    TasteResponseSchema.parse({
      taste: userPreferences.taste,
      routines: userPreferences.routines,
      playlists: userPreferences.playlists,
      moodRules: userPreferences.moodRules
    })
  );

  app.get("/cache/tts/*", async (request, reply) => {
    const filename = (request.params as Record<string, string>)["*"];

    if (typeof filename !== "string") {
      return reply.status(404).send("Not found");
    }

    const filePath = resolve(ttsCacheDir, filename);
    const relativePath = relative(resolve(ttsCacheDir), filePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(filePath)) {
      return reply.status(404).send("Not found");
    }

    return reply.type("audio/mpeg").send(createReadStream(filePath));
  });

  app.get("/api/episode/next", async () => {
    const { track, decision } = await resolveNextTrackAndDecision();

    const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(decision.say);
    rememberSelectedTrack(track);

    let lyricSources: RadioEpisode["sources"] = [];
    try {
      const adapterSources = await storySource.gather(track);
      lyricSources = adapterSources.length > 0 ? adapterSources : [];
    } catch {
      lyricSources = [];
    }

    let metadataSources: RadioEpisode["sources"] = [];
    try {
      const publicMetadata = options.publicMetadataAdapter ?? createPublicMetadataAdapter();
      const adapterSources = await publicMetadata.gather(track);
      metadataSources = adapterSources.length > 0 ? adapterSources : [];
    } catch {
      metadataSources = [];
    }

    let webSources: RadioEpisode["sources"] = [];
    try {
      const webResearch = options.webResearchAdapter ?? createWebResearchAdapter(
        env.FAKERADIO_BRAVE_API_KEY ? { apiKey: env.FAKERADIO_BRAVE_API_KEY } : {}
      );
      const adapterSources = await webResearch.gather(track);
      webSources = adapterSources.length > 0 ? adapterSources : [];
    } catch {
      webSources = [];
    }

    const combinedSources = [...lyricSources, ...metadataSources, ...webSources];
    const sources: RadioEpisode["sources"] = combinedSources.length > 0 ? combinedSources : [
      {
        kind: "mock",
        title: "mock source",
        content: "Placeholder source note for story generation."
      }
    ];

    const hasLyricSource = sources.some((s) => s.kind === "lyric");
    const hasBackgroundSource = sources.some((s) =>
      (s.kind === "metadata" || s.kind === "web") && (s.confidence ?? 0) >= 0.5
    );

    const storyType: RadioEpisode["story"]["type"] = hasBackgroundSource
      ? "background"
      : hasLyricSource
        ? "lyric-theme"
        : "mood-reading";

    const episode: RadioEpisode = {
      track,
      story: {
        text: decision.say,
        audioUrl: storyTtsResult.audioUrl,
        type: storyType
      },
      sources,
      playback: {
        crossfadeStartOffsetMs: 3000,
        musicStartVolume: 0.2
      },
      fallbackReason
    };

    return EpisodeNextResponseSchema.parse({ episode });
  });

  app.get("/api/plan/today", async () => TodayPlanResponseSchema.parse(buildTodayPlan(nowProvider())));

  app.get("/stream", { websocket: true }, (connection) => {
    const removeClient = stream.add(connection);
    connection.on("close", removeClient);
    const event = StreamEventSchema.parse({
      type: "diagnostic",
      payload: {
        level: "info",
        message: "FakeRadio stream connected",
        at: new Date().toISOString()
      }
    });
    connection.send(JSON.stringify(event));
  });

  return app;
}
