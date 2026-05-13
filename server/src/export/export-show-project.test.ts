import { describe, expect, it, vi, beforeEach } from "vitest";
import { exportShowProject } from "./export-show-project.js";
import type { ShowProject, ShowPlan, ShowJob } from "@fakeradio/shared";
import type * as FsPromises from "node:fs/promises";
import type * as FsModule from "node:fs";

const { mockFsPromises, mockFfmpegAvailable } = vi.hoisted(() => {
  let ffmpegAvailable = true;
  return {
    mockFsPromises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockImplementation((path: string) => {
        if (typeof path === "string" && path.includes(".json")) {
          return Promise.resolve(JSON.stringify({
            track: { id: "track-1", title: "Test Track", artist: "Test Artist", audioUrl: "/audio/test.mp3" },
            story: { text: "Test story", audioUrl: "/cache/tts/test.mp3", type: "background" },
            sources: [],
            playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
          }));
        }
        return Promise.resolve(Buffer.from("fake mp3 content"));
      }),
      readdir: vi.fn().mockResolvedValue(["episode-000-opening.json"]),
    },
    mockFfmpegAvailable: {
      get value() { return ffmpegAvailable; },
      set value(v: boolean) { ffmpegAvailable = v; },
    },
  };
});

vi.mock("node:fs/promises", () => mockFsPromises);
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  createWriteStream: vi.fn(),
}));
vi.mock("./show-notes-generator.js", () => ({
  generateShowNotes: vi.fn().mockReturnValue("# FakeRadio · 2026-05-12\n\nMock notes.\n"),
}));

vi.mock("./audio-mixer.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./audio-mixer.js")>();
  return {
    ...original,
    checkFfmpegAvailable: vi.fn().mockImplementation(() => Promise.resolve(mockFfmpegAvailable.value)),
  };
});

const makeBrief = () => ({
  id: "brief-1",
  type: "theme-show" as const,
  topic: "Bee Gees",
  targetDate: "2026-05-12",
  priority: "user-requested" as const,
  status: "confirmed" as const,
  createdAt: "2026-05-12T10:00:00Z",
  updatedAt: "2026-05-12T10:00:00Z",
});

const makeShowPlan = (): ShowPlan => ({
  id: "plan-1",
  briefId: "brief-1",
  version: 1,
  active: true,
  briefSnapshot: makeBrief(),
  blocks: [
    { role: "opening", title: "The Disco Era Begins", storyGoal: "Set the stage", selectionGoal: "Upbeat opener", sourceNeeds: [], constraints: {}, episodeTargets: [] },
    { role: "closing", title: "Legacy", storyGoal: "Wrap up", selectionGoal: "Emotional closer", sourceNeeds: [], constraints: {}, episodeTargets: [] },
  ],
  totalDurationMinutes: 60,
  createdAt: "2026-05-12T10:00:00Z",
  updatedAt: "2026-05-12T10:00:00Z",
});

const makeJob = (status: ShowJob["status"] = "completed"): ShowJob => ({
  id: "job-1",
  briefId: "brief-1",
  planId: "plan-1",
  status,
  createdAt: "2026-05-12T10:00:00Z",
  updatedAt: "2026-05-12T10:05:00Z",
  completedAt: status === "completed" ? "2026-05-12T10:05:00Z" : undefined,
  logs: [],
  trace: status === "completed" ? [
    { timestamp: "2026-05-12T10:01:00Z", type: "llm", operation: "generate-plan", summary: "Plan generated", success: true },
    { timestamp: "2026-05-12T10:02:00Z", type: "adapter", operation: "select-track", summary: "Track selected", success: true },
  ] : [],
});

const makeProject = (overrides: Partial<ShowProject> = {}): ShowProject => ({
  id: "proj-1",
  briefId: "brief-1",
  slug: "2026-05-12-bee-gees",
  status: "ready",
  directoryPath: "/tmp/fakeradio/shows/2026-05-12-bee-gees",
  showAudioPath: "/tmp/fakeradio/shows/2026-05-12-bee-gees/show-original.mp3",
  createdAt: "2026-05-12T10:00:00Z",
  updatedAt: "2026-05-12T10:05:00Z",
  ...overrides,
});

describe("exportShowProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ExportResult with downloadUrl and metadata", async () => {
    const project = makeProject();
    const plan = makeShowPlan();
    const job = makeJob("completed");

    const result = await exportShowProject({
      project,
      plan,
      job,
      includeTrace: true,
    });

    expect(result.downloadUrl).toContain("/api/export/project/");
    expect(result.projectId).toBe("proj-1");
    expect(result.date).toBe("2026-05-12");
    expect(result.blocksCount).toBe(2);
  });

  it("writes show-plan.json to project directory", async () => {
    const project = makeProject();
    const plan = makeShowPlan();
    const job = makeJob();

    await exportShowProject({ project, plan, job, includeTrace: true });

    const { writeFile } = await import("node:fs/promises");
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("show-plan.json"),
      expect.stringContaining('"id": "plan-1"'),
      "utf-8"
    );
  });

  it("writes production-trace.jsonl when includeTrace is true", async () => {
    const project = makeProject();
    const plan = makeShowPlan();
    const job = makeJob();

    await exportShowProject({ project, plan, job, includeTrace: true });

    const { writeFile } = await import("node:fs/promises");
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("production-trace.jsonl"),
      expect.any(String),
      "utf-8"
    );
  });

  it("skips production-trace.jsonl when includeTrace is false", async () => {
    const project = makeProject();
    const plan = makeShowPlan();
    const job = makeJob();

    await exportShowProject({ project, plan, job, includeTrace: false });

    const { writeFile } = await import("node:fs/promises");
    const traceCall = (vi.mocked(writeFile).mock.calls as string[][]).find(
      (call) => call[0]?.includes("production-trace")
    );
    expect(traceCall).toBeUndefined();
  });

  it("throws when job is not completed", async () => {
    const project = makeProject();
    const plan = makeShowPlan();
    const job = makeJob("running");

    await expect(
      exportShowProject({ project, plan, job, includeTrace: true })
    ).rejects.toThrow("节目尚未完成生成");
  });

  it("throws with diagnostic error when no audio segments available", async () => {
    const project = makeProject({ showAudioPath: undefined });
    const plan = makeShowPlan();
    const job = makeJob();

    mockFsPromises.readdir.mockResolvedValueOnce(["episode-000-opening.json"] as any);
    mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify({
      track: { id: "track-1", title: "Test Track", artist: "Test Artist" },
      story: { text: "Test story", type: "background" },
      sources: [],
      playback: {}
    }) as any);

    await expect(
      exportShowProject({ project, plan, job, includeTrace: true })
    ).rejects.toThrow("无法生成音频：未找到任何可拼接的音频片段");
  });

  it("throws with diagnostic error when ffmpeg is not available", async () => {
    const project = makeProject({ showAudioPath: undefined });
    const plan = makeShowPlan();
    const job = makeJob();

    mockFfmpegAvailable.value = false;
    mockFsPromises.readdir.mockResolvedValueOnce(["episode-000-opening.json"] as any);
    mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify({
      track: { id: "track-1", title: "Test Track", artist: "Test Artist", audioUrl: "/audio/test.mp3" },
      story: { text: "Test story", audioUrl: "/cache/tts/test.mp3", type: "background" },
      sources: [],
      playback: {}
    }) as any);

    await expect(
      exportShowProject({ project, plan, job, includeTrace: true })
    ).rejects.toThrow("无法生成音频：FFmpeg 未安装");
    
    mockFfmpegAvailable.value = true;
  });
});
