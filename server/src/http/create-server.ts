import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  HealthResponseSchema,
  NextResponseSchema,
  NowResponseSchema,
  StreamEventSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  type NowResponse,
  type Track
} from "@fakeradio/shared";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMusicAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter,
  createEdgeTtsAdapter
} from "../adapters/index.js";
import { createReadStream, existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { TtsAdapter } from "../adapters/types.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { env } from "../config/env.js";
import { createStreamBroadcaster } from "../realtime/stream-bus.js";
import { buildTodayPlan, getCurrentPlanBlock } from "../scheduler/radio-scheduler.js";
import { createInMemoryMemoryRepository } from "../state/memory-repository.js";

const PLAYLISTS = [
  {
    id: "morning-soft-start",
    name: "早晨轻启动",
    description: "温暖、低刺激、适合开始一天。",
    seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
  }
];

type CreateRadioServerOptions = {
  musicAdapterResult?: Awaited<ReturnType<typeof createMusicAdapter>>;
  now?: () => Date;
  ttsAdapter?: TtsAdapter;
  ttsCacheDir?: string;
};

export async function createRadioServer(options: CreateRadioServerOptions = {}) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
  });
  await app.register(websocket);

  const llm = createMockLlmAdapter();
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
      cacheDir: resolve(process.cwd(), env.FAKERADIO_TTS_CACHE_DIR),
      voice: env.FAKERADIO_TTS_VOICE
    });
  const weather = createMockWeatherAdapter();
  const calendar = createMockCalendarAdapter();
  const devices = createMockDeviceAdapter();
  const stream = createStreamBroadcaster();
  const memory = createInMemoryMemoryRepository();
  const nowProvider = options.now ?? (() => new Date());
  let currentTrack: Track | null = null;
  let currentDj: NowResponse["dj"] = {
    say: "FakeRadio 准备好了。"
  };
  const currentPlan = buildTodayPlan(nowProvider());
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
        upnp: "mock"
      },
      checkedAt: new Date().toISOString()
    })
  );

  app.get("/api/now", async () => buildNowResponse());

  app.get("/api/next", async () => {
    const now = nowProvider();
    const weatherSnapshot = await weather.current();
    const calendarItems = await calendar.upcoming();
    const playbackDevices = await devices.list();
    const recentMemoryEntries = await memory.recent(5);
    const draftDecision = await computeDjDecision({
      llm,
      now,
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "早晨低刺激启动，工作时段稳定少打扰。",
      moodRules: "晴天早晨温暖轻盈。",
      recentMemory: recentMemoryEntries.map((entry) => entry.content),
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: `${weatherSnapshot.summary}, ${weatherSnapshot.moodHint}`,
        calendar: calendarItems.map((item) => `${item.start} ${item.title}`).join(", "),
        devices: playbackDevices.map((device) => `${device.name} ${device.status}`).join(", ")
      }
    });
    const candidates = await music.search(draftDecision.play.query ?? "warm morning indie");
    let track: Track;

    if (candidates.length > 0) {
      track = await music.resolve(candidates[0]!);
    } else if (queue.length > 0) {
      track = await music.resolve(queue[0]!);
    } else {
      const mockMusic = createMockMusicAdapter();
      const fallbackTracks = await mockMusic.search("warm morning indie");
      track = await mockMusic.resolve(fallbackTracks[0]!);
    }

    const isFallback = candidates.length === 0 && queue.length === 0;
    const decision = await computeDjDecision({
      llm,
      now,
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "早晨低刺激启动，工作时段稳定少打扰。",
      moodRules: "晴天早晨温暖轻盈。",
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
        weather: `${weatherSnapshot.summary}, ${weatherSnapshot.moodHint}`,
        calendar: calendarItems.map((item) => `${item.start} ${item.title}`).join(", "),
        devices: playbackDevices.map((device) => `${device.name} ${device.status}`).join(", ")
      }
    });
    const ttsResult = await tts.synthesize(decision.say);
    currentTrack = track;
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
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "工作时段稳定少打扰。",
      moodRules: "用户主动输入时优先尊重用户意图。",
      recentMemory: [],
      userMessage: body.message,
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: "mock weather",
        calendar: "mock calendar",
        devices: "Local Browser available"
      }
    });

    return ChatResponseSchema.parse({
      message: decision.say,
      decision
    });
  });

  app.get("/api/taste", async () =>
    TasteResponseSchema.parse({
      taste: "喜欢低刺激、能持续陪伴的音乐。",
      routines: "早晨低刺激启动；工作时段稳定少打扰；晚间降速。",
      playlists: PLAYLISTS,
      moodRules: "晴天早晨温暖轻盈；工作时段少人声。"
    })
  );

  const TTS_CACHE_DIR = options.ttsCacheDir ?? resolve(process.cwd(), env.FAKERADIO_TTS_CACHE_DIR);

  app.get("/cache/tts/*", async (request, reply) => {
    const filename = (request.params as Record<string, string>)["*"];

    if (typeof filename !== "string") {
      return reply.status(404).send("Not found");
    }

    const filePath = resolve(TTS_CACHE_DIR, filename);
    const relativePath = relative(resolve(TTS_CACHE_DIR), filePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(filePath)) {
      return reply.status(404).send("Not found");
    }

    return reply.type("audio/mpeg").send(createReadStream(filePath));
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
