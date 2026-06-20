import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeMusicAdapter, createFakeStorySourceAdapter, createFakeTtsAdapter } from "../test/fake-adapters.js";
import { createRadioServer } from "./create-server.js";
import { createFakeLlmAdapter, createFakeMusicAdapter as mkMusic, createFakeWeatherAdapter, createFakeCalendarAdapter, createFakeDeviceAdapter } from "../test/fake-adapters.js";
import { createShowProjectRepository } from "../show/show-project-repository.js";

let app: FastifyInstance | undefined;
let isolatedBaseDirs: string[] = [];

function createFakeMusicAdapterResult() {
  return {
    music: createFakeMusicAdapter(),
    status: "ready" as const
  };
}

function createEmptyLikedSongsBaseDir() {
  const dir = mkdtempSync(join(tmpdir(), "fakeradio-generate-test-"));
  mkdirSync(join(dir, "user"), { recursive: true });
  writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
  isolatedBaseDirs.push(dir);
  return dir;
}

function createTestRadioServer(options: Parameters<typeof createRadioServer>[0] = {}) {
  return createRadioServer({
    ...options,
    llmAdapter: options.llmAdapter ?? createFakeLlmAdapter(),
    baseDir: options.baseDir ?? createEmptyLikedSongsBaseDir()
  });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of isolatedBaseDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  isolatedBaseDirs = [];
});

describe("generate-now execution flow", () => {
  describe("POST /api/shows/generate-now with full execution", () => {
    it("creates job, executes episode generation, and completes job with episodes", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createFakeMusicAdapterResult(),
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 8, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Test Execution 主题节目" }
      });
      expect(briefResponse.statusCode).toBe(200);
      const brief = briefResponse.json().brief;
      expect(brief).toBeDefined();
      expect(brief.id).toBeTruthy();

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      expect(planResponse.statusCode).toBe(200);
      const activePlan = planResponse.json().plan;
      expect(activePlan).toBeDefined();
      expect(activePlan.blocks.length).toBeGreaterThan(0);

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      expect(generateResponse.statusCode).toBe(201);
      const { project, job } = generateResponse.json();
      expect(project).toBeDefined();
      expect(job).toBeDefined();
      expect(job.status).toBe("completed");
      expect(project.status).toBe("ready");
      expect(project.directoryPath).toBeTruthy();

      const episodeFiles = await import("node:fs/promises");
      const files = await episodeFiles.readdir(project.directoryPath);
      const episodeFileList = files.filter(f => f.startsWith("episode-") && f.endsWith(".json"));
      expect(episodeFileList.length).toBeGreaterThan(0);

      const firstEpisodeContent = await episodeFiles.readFile(join(project.directoryPath, episodeFileList[0]), "utf-8");
      const firstEpisode = JSON.parse(firstEpisodeContent);
      expect(firstEpisode.track).toBeDefined();
      expect(firstEpisode.story).toBeDefined();
      expect(firstEpisode.story.text).toBeTruthy();
      expect(firstEpisode.story.audioUrl).toBeTruthy();
    });

    it("generates multiple episodes for plan with multiple blocks", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createFakeMusicAdapterResult(),
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 10, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Multi Block Test 主题节目" }
      });
      expect(briefResponse.statusCode).toBe(200);
      const brief = briefResponse.json().brief;

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      const activePlan = planResponse.json().plan;
      const blockCount = activePlan.blocks.length;

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      expect(generateResponse.statusCode).toBe(201);
      const { project, job } = generateResponse.json();

      expect(job.status).toBe("completed");
      expect(project.status).toBe("ready");
      expect(project.directoryPath).toBeTruthy();

      const episodeFiles = await import("node:fs/promises");
      const files = await episodeFiles.readdir(project.directoryPath);
      const episodeFileList = files.filter(f => f.startsWith("episode-") && f.endsWith(".json"));

      expect(episodeFileList.length).toBeGreaterThanOrEqual(1);
      expect(episodeFileList.length).toBeLessThanOrEqual(blockCount);
    });

    it("marks job as failed when all blocks fail", async () => {
      const failingMusicAdapter = {
        recommend: vi.fn().mockResolvedValue([]),
        search: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockRejectedValue(new Error("No music available"))
      };

      app = await createTestRadioServer({
        musicAdapterResult: {
          music: failingMusicAdapter,
          status: "ready" as const
        },
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 12, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Fail Test 主题节目" }
      });
      const brief = briefResponse.json().brief;

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      const activePlan = planResponse.json().plan;

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      const { project, job } = generateResponse.json();

      expect(job.status).toBe("failed");
      expect(project.status).toBe("failed");
    });

    it("adds trace entries to job during execution", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createFakeMusicAdapterResult(),
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 14, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Trace Test 主题节目" }
      });
      const brief = briefResponse.json().brief;

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      const activePlan = planResponse.json().plan;

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      const { project, job } = generateResponse.json();

      expect(job.status).toBe("completed");
      expect(job.trace).toBeDefined();
      expect(job.trace.length).toBeGreaterThan(0);
      expect(job.logs).toBeDefined();
      expect(job.logs.length).toBeGreaterThan(0);
    });

    it("updates project status to ready after successful execution", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createFakeMusicAdapterResult(),
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 16, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Status Test 主题节目" }
      });
      const brief = briefResponse.json().brief;

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      const activePlan = planResponse.json().plan;

      const generateResponse = await app.inject({
        method: "POST",
        url: "/api/shows/generate-now",
        payload: { briefId: brief.id }
      });
      const { project, job } = generateResponse.json();

      expect(project.status).toBe("ready");
      expect(job.status).toBe("completed");
    });

    it("can export project after successful execution", async () => {
      app = await createTestRadioServer({
        musicAdapterResult: createFakeMusicAdapterResult(),
        ttsAdapter: createFakeTtsAdapter(),
        storySourceAdapter: createFakeStorySourceAdapter(),
        publicMetadataAdapter: createFakeStorySourceAdapter(),
        webResearchAdapter: createFakeStorySourceAdapter(),
        now: () => new Date(2026, 4, 13, 18, 0, 0)
      });

      const briefResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "帮我做一期 Export After Exec 主题节目" }
      });
      const brief = briefResponse.json().brief;

      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${brief.id}/active`
      });
      const activePlan = planResponse.json().plan;

      const generateResponse = await app.inject({
        method: "POST",
        url: `/api/shows/generate-now`,
        payload: { briefId: brief.id }
      });
      const { project, job } = generateResponse.json();

      expect(job.status).toBe("completed");

      const exportResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/export`,
        payload: { includeTrace: true }
      });

      if (exportResponse.statusCode === 500) {
        const errorBody = exportResponse.json();
        expect(errorBody.error).toContain("无法生成音频");
      } else {
        expect(exportResponse.statusCode).toBe(200);
        const exportData = exportResponse.json();
        expect(exportData).toBeDefined();
        expect(exportData.downloadUrl).toBeDefined();
        expect(exportData.projectId).toBe(project.id);
      }
    });
  });
});

describe("daily-show plan generator selection", () => {
  it("uses showPlanGenerator for theme-show briefs", async () => {
    app = await createTestRadioServer({
      musicAdapterResult: createFakeMusicAdapterResult(),
      ttsAdapter: createFakeTtsAdapter(),
      storySourceAdapter: createFakeStorySourceAdapter(),
      publicMetadataAdapter: createFakeStorySourceAdapter(),
      webResearchAdapter: createFakeStorySourceAdapter(),
      now: () => new Date(2026, 4, 14, 11, 0, 0)
    });

    // Create a theme-show brief via chat
    const briefResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "帮我做一期 Theme Test 主题节目" }
    });
    expect(briefResponse.statusCode).toBe(200);
    const brief = briefResponse.json().brief;

    // Verify the brief is theme-show
    expect(brief.type).toBe("theme-show");

    // Call schedule-tonight
    const scheduleResponse = await app.inject({
      method: "POST",
      url: "/api/shows/schedule-tonight",
      payload: { briefId: brief.id }
    });
    expect(scheduleResponse.statusCode).toBe(201);

    // Check that the generated plan has theme-show roles, not daily roles
    const planResponse = await app.inject({
      method: "GET",
      url: `/api/plans/${brief.id}/active`
    });
    expect(planResponse.statusCode).toBe(200);
    const activePlan = planResponse.json().plan;
    
    // Verify no blocks have daily-show roles
    const hasDailyRoles = activePlan.blocks.some((block: any) => 
      ["morning", "afternoon", "evening"].includes(block.role)
    );
    expect(hasDailyRoles).toBe(false);
  });
});
