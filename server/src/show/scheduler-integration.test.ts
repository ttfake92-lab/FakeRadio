import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scheduleTonightBriefIfNeeded, executeScheduledJob, type SchedulerIntegrationDeps, type SchedulerExecutionDeps } from "./scheduler-integration.js";
import { createProgramBriefRepository } from "./program-brief-repository.js";
import { createShowPlanRepository } from "./show-plan-repository.js";
import { createJobRegistry } from "./show-generation-job.js";
import { createShowProjectRepository } from "./show-project-repository.js";
import { createMockLlmAdapter, createMockMusicAdapter, createMockTtsAdapter, createMockWeatherAdapter, createMockCalendarAdapter, createMockDeviceAdapter, createMockStorySourceAdapter } from "../adapters/index.js";
import type { ProgramBrief, ShowPlan } from "@fakeradio/shared";

let testDirs: string[] = [];

function createTestBriefRepo(programsDir: string) {
  return createProgramBriefRepository(programsDir);
}

function createTestPlanRepo(programsDir: string) {
  return createShowPlanRepository(programsDir);
}

function createTestJobRegistry(programsDir: string) {
  return createJobRegistry(programsDir);
}

function createTestShowProjectRepo(showsDir: string) {
  return createShowProjectRepository(showsDir);
}

function createTestExecutionDeps(baseDir: string): SchedulerExecutionDeps {
  const programsDir = join(baseDir, "programs");
  const showsDir = join(baseDir, "shows");
  mkdirSync(programsDir, { recursive: true });
  mkdirSync(showsDir, { recursive: true });

  return {
    planRepo: createTestPlanRepo(programsDir),
    showProjectRepo: createTestShowProjectRepo(showsDir),
    jobRegistry: createTestJobRegistry(programsDir),
    llm: createMockLlmAdapter(),
    music: createMockMusicAdapter(),
    tts: createMockTtsAdapter(),
    ttsCacheDir: join(baseDir, "tts-cache"),
    weather: createMockWeatherAdapter(),
    calendar: createMockCalendarAdapter(),
    devices: createMockDeviceAdapter(),
    storySource: createMockStorySourceAdapter(),
    likedSongs: {
      list: async () => []
    } as any,
    systemPrompt: "You are a test DJ."
  };
}

describe("scheduler-integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const dir of testDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    testDirs = [];
  });

  describe("scheduleTonightBriefIfNeeded", () => {
    it("creates and starts job for scheduled brief matching target date", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const brief: ProgramBrief = {
        id: "test-brief-001",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "scheduled",
        targetDate: "2026-05-13",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(brief);

      const plan: ShowPlan = {
        id: "test-plan-001",
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks: [
          {
            role: "opening",
            title: "Test Opening",
            storyGoal: "Open the show",
            selectionGoal: "Choose an opening track",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          },
          {
            role: "closing",
            title: "Test Closing",
            storyGoal: "Close the show",
            selectionGoal: "Choose a closing track",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(plan);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-13"
      };

      await scheduleTonightBriefIfNeeded(deps);

      const jobs = await jobRegistry.list({ briefId: brief.id });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe("running");

      const updatedBrief = await briefRepo.get(brief.id);
      expect(updatedBrief?.status).toBe("generating");
    });

    it("skips when no scheduled brief matches target date", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const brief: ProgramBrief = {
        id: "test-brief-002",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "scheduled",
        targetDate: "2026-05-12",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(brief);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-13"
      };

      await scheduleTonightBriefIfNeeded(deps);

      const jobs = await jobRegistry.list();
      expect(jobs).toHaveLength(0);
    });

    it("skips when scheduled brief has no active plan", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const brief: ProgramBrief = {
        id: "test-brief-003",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "scheduled",
        targetDate: "2026-05-13",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(brief);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-13"
      };

      await scheduleTonightBriefIfNeeded(deps);

      const jobs = await jobRegistry.list();
      expect(jobs).toHaveLength(0);
    });
  });

  describe("executeScheduledJob", () => {
    it("generates episodes and completes job when tracks available", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);

      const programsDir = join(baseDir, "programs");
      const showsDir = join(baseDir, "shows");
      const userDir = join(baseDir, "user");
      mkdirSync(programsDir, { recursive: true });
      mkdirSync(showsDir, { recursive: true });
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, "netease-liked-songs.raw.json"), JSON.stringify([
        { id: "test-track-001", title: "Test Track 1", artist: "Test Artist", album: "Test Album", audioUrl: "https://example.com/track1.mp3" }
      ]), "utf-8");

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);
      const showProjectRepo = createTestShowProjectRepo(showsDir);

      const brief: ProgramBrief = {
        id: "test-brief-exec-001",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "generating",
        targetDate: "2026-05-13",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(brief);

      const plan: ShowPlan = {
        id: "test-plan-exec-001",
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks: [
          {
            role: "opening",
            title: "Test Opening",
            storyGoal: "Open the show",
            selectionGoal: "Choose an opening track",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(plan);

      const project = await showProjectRepo.create({ briefId: brief.id, slug: "test-show-001" });
      await showProjectRepo.update(project.id, { activePlanId: plan.id });

      const job = await jobRegistry.create({ briefId: brief.id, planId: plan.id });
      await jobRegistry.start(job.id);

      const deps: SchedulerExecutionDeps = {
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createMockLlmAdapter(),
        music: createMockMusicAdapter(),
        tts: createMockTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createMockWeatherAdapter(),
        calendar: createMockCalendarAdapter(),
        devices: createMockDeviceAdapter(),
        storySource: createMockStorySourceAdapter(),
        likedSongs: {
          list: async () => [{
            id: "test-track-001",
            title: "Test Track 1",
            artist: "Test Artist",
            album: "Test Album",
            audioUrl: "https://example.com/track1.mp3"
          }]
        } as any,
        systemPrompt: "You are a test DJ."
      };

      await executeScheduledJob(deps, brief.id, plan.id, job.id);

      const updatedJob = await jobRegistry.get(job.id);
      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.logs.length).toBeGreaterThan(0);

      const updatedProject = await showProjectRepo.get(project.id);
      expect(updatedProject?.status).toBe("ready");

      const projectFiles = readdirSync(updatedProject!.directoryPath);
      const episodeFiles = projectFiles.filter(f => f.startsWith("episode-") && f.endsWith(".json"));
      expect(episodeFiles.length).toBeGreaterThanOrEqual(1);
    });

    it("marks job as failed when no project found", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);

      const programsDir = join(baseDir, "programs");
      const showsDir = join(baseDir, "shows");
      mkdirSync(programsDir, { recursive: true });
      mkdirSync(showsDir, { recursive: true });

      const planRepo = createTestPlanRepo(programsDir);
      const showProjectRepo = createTestShowProjectRepo(showsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const job = await jobRegistry.create({ briefId: "non-existent-brief", planId: "non-existent-plan" });
      await jobRegistry.start(job.id);

      const deps: SchedulerExecutionDeps = {
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createMockLlmAdapter(),
        music: createMockMusicAdapter(),
        tts: createMockTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createMockWeatherAdapter(),
        calendar: createMockCalendarAdapter(),
        devices: createMockDeviceAdapter(),
        storySource: createMockStorySourceAdapter(),
        likedSongs: { list: async () => [] } as any,
        systemPrompt: "Test DJ"
      };

      await executeScheduledJob(deps, "non-existent-brief", "non-existent-plan", job.id);

      const updatedJob = await jobRegistry.get(job.id);
      expect(updatedJob?.status).toBe("failed");
    });
  });
});
