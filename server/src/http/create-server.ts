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
  type Track
} from "@fakeradio/shared";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter
} from "../adapters/index.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { buildTodayPlan } from "../scheduler/radio-scheduler.js";

const PLAYLISTS = [
  {
    id: "morning-soft-start",
    name: "早晨轻启动",
    description: "温暖、低刺激、适合开始一天。",
    seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
  }
];

export async function createRadioServer() {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const llm = createMockLlmAdapter();
  const music = createMockMusicAdapter();
  const tts = createMockTtsAdapter();
  const weather = createMockWeatherAdapter();
  const calendar = createMockCalendarAdapter();
  const devices = createMockDeviceAdapter();
  let currentTrack: Track | null = null;
  const queue = await music.recommend({ mood: "warm morning indie", limit: 3 });

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: "mock",
        music: "mock",
        tts: "mock",
        weather: "mock",
        calendar: "mock",
        upnp: "mock"
      },
      checkedAt: new Date().toISOString()
    })
  );

  app.get("/api/now", async () =>
    NowResponseSchema.parse({
      playback: currentTrack ? "playing" : "idle",
      track: currentTrack,
      dj: {
        say: currentTrack ? `正在播放 ${currentTrack.title}` : "FakeRadio 准备好了。"
      },
      queue,
      updatedAt: new Date().toISOString()
    })
  );

  app.get("/api/next", async () => {
    const weatherSnapshot = await weather.current();
    const calendarItems = await calendar.upcoming();
    const playbackDevices = await devices.list();
    const decision = await computeDjDecision({
      llm,
      now: new Date(),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "早晨低刺激启动，工作时段稳定少打扰。",
      moodRules: "晴天早晨温暖轻盈。",
      recentMemory: [],
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: `${weatherSnapshot.summary}, ${weatherSnapshot.moodHint}`,
        calendar: calendarItems.map((item) => `${item.start} ${item.title}`).join(", "),
        devices: playbackDevices.map((device) => `${device.name} ${device.status}`).join(", ")
      }
    });
    const candidates = await music.search(decision.play.query ?? "warm morning indie");
    const track = await music.resolve(candidates[0] ?? queue[0]!);
    currentTrack = track;

    return NextResponseSchema.parse({
      decision,
      track,
      queue,
      tts: await tts.synthesize(decision.say)
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

  app.get("/api/plan/today", async () => TodayPlanResponseSchema.parse(buildTodayPlan(new Date())));

  app.get("/stream", { websocket: true }, (connection) => {
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
