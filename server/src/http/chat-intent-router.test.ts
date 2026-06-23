import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RegisterRoutesDeps } from "./types.js";
import type { Track, ProgramBrief } from "@fakeradio/shared";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockResolveNextTrackAndDecision = vi.fn();
const mockSynthesizeWithFallback = vi.fn();
const mockComputeDjDecision = vi.fn();
const mockParseBriefIntent = vi.fn();
const mockCreateBriefFromIntent = vi.fn();
const mockInferAndSaveTaste = vi.fn();
const mockReadTaste = vi.fn();
const mockWriteTaste = vi.fn();
const mockStartExportTask = vi.fn();
const mockFormatRadioDate = vi.fn();

vi.mock("./episode-runner.js", () => ({
  resolveNextTrackAndDecision: mockResolveNextTrackAndDecision,
  synthesizeWithFallback: mockSynthesizeWithFallback,
}));

vi.mock("../brain/dj-brain.js", () => ({
  computeDjDecision: mockComputeDjDecision,
}));

vi.mock("../show/brief-intent-parser.js", () => ({
  parseBriefIntent: mockParseBriefIntent,
  parseBriefIntentWithLlm: vi.fn(),
  createBriefFromIntent: mockCreateBriefFromIntent,
}));

vi.mock("../user/taste-inferer.js", () => ({
  inferAndSaveTaste: mockInferAndSaveTaste,
}));

vi.mock("../user/taste-writer.js", () => ({
  readTaste: mockReadTaste,
  writeTaste: mockWriteTaste,
}));

vi.mock("../export/export-pipeline.js", () => ({
  startExportTask: mockStartExportTask,
}));

vi.mock("../utils/time.js", () => ({
  formatRadioDate: mockFormatRadioDate,
}));

vi.mock("../config/env.js", () => ({
  env: {},
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

const { handleChat } = await import("./chat-intent-router.js");

// ─── Test fixtures ───────────────────────────────────────────────────────────

const FAKE_TRACK: Track = {
  id: "track-1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  duration: 180,
  source: "netease",
  sourceId: "12345",
};

const FAKE_BRIEF: ProgramBrief = {
  id: "brief-1",
  type: "theme-show",
  topic: "爵士之夜",
  scope: "full-show",
  targetDate: "2026-05-29",
  priority: "user-requested",
  status: "draft",
  createdAt: "2026-05-29T10:00:00.000Z",
  updatedAt: "2026-05-29T10:00:00.000Z",
};

function makeDeps(overrides: Partial<RegisterRoutesDeps> = {}): RegisterRoutesDeps {
  return {
    app: {} as never,
    state: {
      getCurrentTrack: vi.fn().mockReturnValue(null),
      getQueue: vi.fn().mockReturnValue([]),
      setQueue: vi.fn(),
      getRecentlySelectedTrackIds: vi.fn().mockReturnValue([]),
      setTrack: vi.fn(),
      rememberSelectedTrack: vi.fn(),
      removeFromQueue: vi.fn(),
      setDj: vi.fn(),
      buildNowResponse: vi.fn().mockReturnValue({}),
    } as never,
    stateRepo: {
      snapshotQueue: vi.fn().mockResolvedValue(undefined),
    } as never,
    stream: {
      broadcast: vi.fn(),
    } as never,
    memory: {} as never,
    favorites: {
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    } as never,
    likedSongs: {} as never,
    sessionRepo: {
      appendMessage: vi.fn(),
      getToday: vi.fn().mockResolvedValue([]),
    } as never,
    trackRegistry: {
      register: vi.fn(),
    } as never,
    audioDir: "/tmp/audio",
    exportDir: "/tmp/export",
    llm: {
      compute: vi.fn().mockResolvedValue({
        say: "mock reply",
        play: { query: "keep current", reason: "mock" },
        reason: "mock",
        segue: "mock reply",
      }),
      computeRaw: vi.fn().mockResolvedValue("mock reply"),
      computeJson: vi.fn(),
    },
    tts: {
      synthesize: vi.fn().mockResolvedValue({ text: "tts", audioUrl: "http://tts/audio.mp3", cacheKey: "k" }),
    },
    ttsCacheDir: "/tmp/tts-cache",
    systemPrompt: "你是 FakeRadio DJ。",
    userPreferences: {
      taste: "喜欢独立音乐",
      routines: "",
      moodRules: "",
    } as never,
    weather: {
      current: vi.fn().mockResolvedValue({ summary: "晴", moodHint: "温暖", temperatureC: 22 }),
    },
    calendar: {
      upcoming: vi.fn().mockResolvedValue([]),
    },
    devices: {
      list: vi.fn().mockResolvedValue([]),
    },
    storySource: {
      gather: vi.fn().mockResolvedValue([]),
    },
    publicMetadataAdapter: undefined,
    webResearchAdapter: undefined,
    currentMoodHint: "温暖",
    nowProvider: () => new Date("2026-05-29T10:00:00Z"),
    storySourceStatus: "disabled",
    webResearchStatus: "disabled",
    neteaseAuth: {} as never,
    baseDir: "/tmp/fakeradio-test",
    programBriefRepo: {
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    } as never,
    showPlanRepo: {
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    } as never,
    showPlanGenerator: {
      generate: vi.fn().mockResolvedValue({
        id: "plan-1",
        briefId: "brief-1",
        blocks: [{ title: "Block 1", type: "music" }],
        totalDurationMinutes: 60,
        version: 1,
      }),
      generateFromPlan: vi.fn().mockImplementation((_plan, brief) =>
        Promise.resolve({
          id: "plan-1",
          briefId: brief.id,
          blocks: [{ role: "origin", title: "Block 1", storyGoal: "story", selectionGoal: "selection", sourceNeeds: [], constraints: {}, episodeTargets: [] }],
          version: 1,
          active: true,
          briefSnapshot: brief,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ),
    },
    dailyShowPlanGenerator: {} as never,
    jobRegistry: {} as never,
    showProjectRepo: {} as never,
    music: {
      search: vi.fn().mockResolvedValue([FAKE_TRACK]),
      resolve: vi.fn().mockImplementation((track: Track) => Promise.resolve(track)),
    } as never,
    musicStatus: "ready",
    ttsStatus: "ready",
    llmStatus: "ready",
    weatherStatus: "ready",
    calendarStatus: "ready",
    ...overrides,
  } as RegisterRoutesDeps;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("handleChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatRadioDate.mockReturnValue("2026-05-29");
    mockReadTaste.mockResolvedValue("喜欢独立音乐");
    mockWriteTaste.mockResolvedValue(undefined);
    mockComputeDjDecision.mockResolvedValue({
      say: "mock DJ reply",
      play: { query: "keep current", reason: "mock" },
      reason: "mock",
      segue: "mock reply",
    });
  });

  // ─── Quick-action regex intents ──────────────────────────────────────────

  describe("regex intent: next-track", () => {
    it.each(["下一首", "next", "切歌", "换一首"])("matches '%s'", async (msg) => {
      const deps = makeDeps({
        state: {
          getCurrentTrack: vi.fn().mockReturnValue(FAKE_TRACK),
          setTrack: vi.fn(),
          rememberSelectedTrack: vi.fn(),
          removeFromQueue: vi.fn(),
          setDj: vi.fn(),
          buildNowResponse: vi.fn().mockReturnValue({}),
        } as never,
      });

      mockResolveNextTrackAndDecision.mockResolvedValue({
        track: FAKE_TRACK,
        decision: {
          say: "来一首新歌",
          play: { query: "next", reason: "user requested" },
          reason: "user requested",
          segue: "来一首新歌",
        },
      });
      mockSynthesizeWithFallback.mockResolvedValue({
        result: { text: "tts", audioUrl: "http://tts/a.mp3", cacheKey: "k" },
      });

      const result = await handleChat({ message: msg }, deps);

      expect(result.action?.type).toBe("next-track");
      expect(mockResolveNextTrackAndDecision).toHaveBeenCalled();
      expect(deps.state.setTrack).toHaveBeenCalledWith(FAKE_TRACK);
    });
  });

  describe("regex intent: add-favorite", () => {
    it.each(["收藏", "喜欢这首歌", "加入收藏", "fav"])("matches '%s'", async (msg) => {
      const deps = makeDeps({
        state: {
          getCurrentTrack: vi.fn().mockReturnValue(FAKE_TRACK),
          setTrack: vi.fn(),
          rememberSelectedTrack: vi.fn(),
          removeFromQueue: vi.fn(),
          setDj: vi.fn(),
          buildNowResponse: vi.fn().mockReturnValue({}),
        } as never,
      });

      const result = await handleChat({ message: msg }, deps);

      expect(result.action?.type).toBe("add-favorite");
      expect(result.action?.trackId).toBe("track-1");
      expect(deps.favorites.save).toHaveBeenCalledWith({
        trackId: "track-1",
        title: "Test Song",
        artist: "Test Artist",
        album: "Test Album",
      });
    });

    it("does NOT match add-favorite when no current track", async () => {
      const deps = makeDeps();
      // state.getCurrentTrack returns null by default

      // Falls through to default LLM chat
      const result = await handleChat({ message: "收藏" }, deps);

      expect(result.action?.type).toBeUndefined();
      expect(deps.favorites.save).not.toHaveBeenCalled();
    });
  });

  describe("regex intent: export-episode", () => {
    it.each(["导出今天", "打包今天", "export today"])("matches '%s' and starts export", async (msg) => {
      const deps = makeDeps();
      mockStartExportTask.mockReturnValue("task-123");

      const result = await handleChat({ message: msg }, deps);

      expect(result.message).toContain("task-123");
      expect(mockStartExportTask).toHaveBeenCalled();
    });

    it("handles export failure", async () => {
      const deps = makeDeps();
      mockStartExportTask.mockImplementation(() => { throw new Error("disk full"); });

      const result = await handleChat({ message: "导出今天" }, deps);

      expect(result.message).toContain("disk full");
    });
  });

  describe("regex intent: update-taste", () => {
    it.each(["不喜欢", "以后少", "更喜欢", "少推", "多推", "不要", "别再"])("matches '%s'", async (msg) => {
      const deps = makeDeps();
      mockComputeDjDecision.mockResolvedValue({
        say: "updated taste content",
        play: { query: "keep current", reason: "taste update" },
        reason: "taste update",
        segue: "updated taste content",
      });

      const result = await handleChat({ message: msg + "推荐电子乐" }, deps);

      expect(result.message).toBe("已更新你的品味偏好。");
      expect(mockWriteTaste).toHaveBeenCalled();
    });
  });

  describe("regex intent: story-background", () => {
    it.each(["讲个故事", "背后的故事", "创作背景", "story", "background"])("matches '%s'", async (msg) => {
      const deps = makeDeps({
        state: {
          getCurrentTrack: vi.fn().mockReturnValue(FAKE_TRACK),
          setTrack: vi.fn(),
          rememberSelectedTrack: vi.fn(),
          removeFromQueue: vi.fn(),
          setDj: vi.fn(),
          buildNowResponse: vi.fn().mockReturnValue({}),
        } as never,
      });
      mockComputeDjDecision.mockResolvedValue({
        say: "这首歌背后有一个温暖的故事。",
        play: { query: "keep current", reason: "story" },
        reason: "story",
        segue: "这首歌背后有一个温暖的故事。",
      });

      const result = await handleChat({ message: msg }, deps);

      expect(result.message).toContain("温暖的故事");
      expect(deps.sessionRepo.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ storyType: expect.any(String) })
      );
    });
  });

  describe("regex intent: personal-memory", () => {
    it.each(["让我想起", "想起", "回忆", "那时候", "记得", "当年"])("matches '%s'", async (msg) => {
      const deps = makeDeps({
        state: {
          getCurrentTrack: vi.fn().mockReturnValue(FAKE_TRACK),
          setTrack: vi.fn(),
          rememberSelectedTrack: vi.fn(),
          removeFromQueue: vi.fn(),
          setDj: vi.fn(),
          buildNowResponse: vi.fn().mockReturnValue({}),
        } as never,
      });
      mockComputeDjDecision.mockResolvedValue({
        say: "那段记忆很美好。",
        play: { query: "keep current", reason: "memory" },
        reason: "memory",
        segue: "那段记忆很美好。",
      });

      const result = await handleChat({ message: msg + "大学时光" }, deps);

      expect(result.message).toContain("记忆");
      expect(deps.sessionRepo.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ storyType: "personal-memory" })
      );
    });
  });

  describe("regex intent: infer-taste", () => {
    it("matches '整理品味' and infers taste when enough session data", async () => {
      const deps = makeDeps({
        sessionRepo: {
          appendMessage: vi.fn(),
          getToday: vi.fn().mockResolvedValue([
            { role: "user", text: "我喜欢爵士" },
            { role: "agent", text: "好的" },
            { role: "user", text: "来点轻松的" },
            { role: "agent", text: "没问题" },
          ]),
        } as never,
      });
      mockInferAndSaveTaste.mockResolvedValue("更新后的品味");

      const result = await handleChat({ message: "整理品味" }, deps);

      expect(result.message).toBe("已根据今天的互动更新品味偏好。");
      expect(mockInferAndSaveTaste).toHaveBeenCalled();
    });

    it("returns 'insufficient data' when session has fewer than 3 entries", async () => {
      const deps = makeDeps({
        sessionRepo: {
          appendMessage: vi.fn(),
          getToday: vi.fn().mockResolvedValue([
            { role: "user", text: "hi" },
          ]),
        } as never,
      });

      const result = await handleChat({ message: "整理品味" }, deps);

      expect(result.message).toContain("互动不够多");
      expect(mockInferAndSaveTaste).not.toHaveBeenCalled();
    });
  });

  // ─── Show programming intents ────────────────────────────────────────────

  describe("show programming: create", () => {
    it("creates a show brief when LLM detects create intent", async () => {
      const deps = makeDeps();
      // LLM returns create intent for show programming detection
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({
        intent: "create",
        topic: "爵士之夜",
      });
      mockParseBriefIntent.mockReturnValue({ isBriefIntent: false }); // no regex match
      mockCreateBriefFromIntent.mockReturnValue(FAKE_BRIEF);

      const result = await handleChat({ message: "帮我做一期爵士节目" }, deps);

      expect(result.action?.type).toBe("show-brief-created");
      expect(result.message).toContain("爵士");
      expect(deps.programBriefRepo.save).toHaveBeenCalled();
    });
  });

  describe("show programming: confirm", () => {
    it("confirms the latest brief when user says '开始生成'", async () => {
      const deps = makeDeps({
        programBriefRepo: {
          save: vi.fn(),
          list: vi.fn().mockResolvedValue([FAKE_BRIEF]),
          update: vi.fn(),
        } as never,
      });

      const result = await handleChat({ message: "开始生成" }, deps);

      expect(result.action?.type).toBe("show-confirmed");
      expect(deps.programBriefRepo.update).toHaveBeenCalledWith("brief-1", { status: "confirmed" });
      expect(deps.stream.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "agent-message" })
      );
    });

    it("falls back to LLM chat when no active brief exists for confirm", async () => {
      const deps = makeDeps({
        programBriefRepo: {
          save: vi.fn(),
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        } as never,
      });
      // LLM returns "none" for show intent
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({ intent: "none" });

      const result = await handleChat({ message: "开始生成" }, deps);

      // Should fall through to default LLM chat (no show-confirmed action)
      expect(result.action?.type).not.toBe("show-confirmed");
    });
  });

  describe("show programming: cancel", () => {
    it("cancels the latest brief when user says '算了'", async () => {
      const deps = makeDeps({
        programBriefRepo: {
          save: vi.fn(),
          list: vi.fn().mockResolvedValue([FAKE_BRIEF]),
          update: vi.fn(),
        } as never,
      });

      const result = await handleChat({ message: "算了" }, deps);

      expect(result.action?.type).toBe("show-cancelled");
      expect(result.message).toContain("取消");
      expect(deps.programBriefRepo.update).toHaveBeenCalledWith("brief-1", { status: "cancelled" });
    });

    it("falls through to normal chat when '取消' is sent but no brief exists", async () => {
      // 没有进行中的节目时,"取消"应当作普通聊天而不是劫持成 show-cancelled——
      // 不然用户随口说"算了/取消"都会冒出"节目已取消"提示,很莫名其妙。
      const deps = makeDeps();

      const result = await handleChat({ message: "取消" }, deps);

      expect(result.action?.type).not.toBe("show-cancelled");
    });
  });

  describe("show programming: refine", () => {
    it("refines the active plan when LLM detects refine intent", async () => {
      const validBlock = {
        role: "origin",
        title: "Refined Block",
        storyGoal: "tell the story",
        selectionGoal: "pick tracks",
        sourceNeeds: [],
        constraints: {},
        episodeTargets: [],
      };
      const existingPlan = {
        id: "plan-1",
        briefId: "brief-1",
        blocks: [validBlock],
        version: 1,
        active: true,
        briefSnapshot: FAKE_BRIEF,
        createdAt: "2026-05-29T10:00:00.000Z",
      };
      const deps = makeDeps({
        programBriefRepo: {
          save: vi.fn(),
          list: vi.fn().mockResolvedValue([FAKE_BRIEF]),
          update: vi.fn(),
        } as never,
        showPlanRepo: {
          save: vi.fn(),
          list: vi.fn().mockResolvedValue([existingPlan]),
        } as never,
      });
      // First computeJson: intent detection -> refine
      // Second computeJson: refinement prompt -> updated blocks
      (deps.llm.computeJson as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ intent: "refine", refinement: "时长改成30分钟" })
        .mockResolvedValueOnce({
          blocks: [{
            role: "origin",
            title: "Updated Block",
            storyGoal: "new story",
            selectionGoal: "new selection",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: [],
          }],
          reason: "时长已调整",
        });

      const result = await handleChat({ message: "时长改成30分钟" }, deps);

      expect(result.action?.type).toBe("show-plan-refined");
      expect(deps.showPlanRepo.save).toHaveBeenCalled();
    });

    it("falls through to normal chat when LLM mis-detects '降速' as refine but no brief exists", async () => {
      // "降速" 等纯氛围词不应触发节目编排,即使 LLM 误判。
      // 没有 active brief 时 gate 会兜底返回 null,让普通聊天/推荐分支接管。
      const deps = makeDeps();
      // 模拟 LLM 把 "降速" 误判成 refine
      (deps.llm.computeJson as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ intent: "refine", refinement: "降速" });

      const result = await handleChat({ message: "降速" }, deps);

      expect(result.action?.type).not.toBe("show-plan-refined");
      expect(deps.showPlanRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Default LLM chat ───────────────────────────────────────────────────

  describe("default LLM chat", () => {
    it("falls through to LLM chat for unmatched messages", async () => {
      const deps = makeDeps();
      // Show intent returns "none"
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({ intent: "none" });

      const result = await handleChat({ message: "今天天气怎么样" }, deps);

      expect(result.message).toBe("mock DJ reply");
      expect(result.action).toBeUndefined();
      expect(deps.sessionRepo.appendMessage).toHaveBeenCalledTimes(2); // user + agent
    });

    it("records the current track ID in session messages when a track is playing", async () => {
      const deps = makeDeps({
        state: {
          getCurrentTrack: vi.fn().mockReturnValue(FAKE_TRACK),
          setTrack: vi.fn(),
          rememberSelectedTrack: vi.fn(),
          removeFromQueue: vi.fn(),
          setDj: vi.fn(),
          buildNowResponse: vi.fn().mockReturnValue({}),
        } as never,
      });
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({ intent: "none" });

      await handleChat({ message: "聊聊音乐" }, deps);

      // User message should include trackId
      expect(deps.sessionRepo.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "user", trackId: "track-1" })
      );
      // Agent message should also include trackId
      expect(deps.sessionRepo.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "agent", trackId: "track-1" })
      );
    });

    it("queues music when LLM decision includes a music query", async () => {
      const deps = makeDeps();
      // Show intent returns "none"
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({ intent: "none" });
      // computeDjDecision is mocked at module level — configure it to return a music request
      mockComputeDjDecision.mockResolvedValue({
        say: "来一首爵士",
        play: { query: "jazz piano", reason: "user mood" },
        reason: "user mood",
        segue: "来一首爵士",
      });
      mockResolveNextTrackAndDecision.mockResolvedValue({
        track: FAKE_TRACK,
        decision: {
          say: "为你播放",
          play: { query: "jazz", reason: "resolved" },
          reason: "resolved",
          segue: "为你播放",
        },
      });
      mockSynthesizeWithFallback.mockResolvedValue({
        result: { text: "tts", audioUrl: "http://tts/a.mp3", cacheKey: "k" },
      });

      const result = await handleChat({ message: "来点爵士" }, deps);

      expect(mockResolveNextTrackAndDecision).not.toHaveBeenCalled();
      expect(result.action?.type).toBe("queue-updated");
      expect(result.action?.trackId).toBe("track-1");
      expect(deps.state.setQueue).toHaveBeenCalledWith([FAKE_TRACK]);
      expect(deps.state.setTrack).not.toHaveBeenCalled();
      expect(deps.stream.broadcast).toHaveBeenCalledWith({
        type: "queue-updated",
        payload: { queue: [FAKE_TRACK] },
      });
    });
  });

  // ─── Session recording ──────────────────────────────────────────────────

  describe("session recording", () => {
    it("appends user message to session before processing", async () => {
      const deps = makeDeps();
      (deps.llm.computeJson as ReturnType<typeof vi.fn>).mockResolvedValue({ intent: "none" });

      await handleChat({ message: "hello" }, deps);

      const appendCalls = (deps.sessionRepo.appendMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(appendCalls[0][0]).toMatchObject({ role: "user", text: "hello" });
    });
  });
});
