import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scheduleTonightBriefIfNeeded, executeScheduledJob, type SchedulerIntegrationDeps, type SchedulerExecutionDeps } from "./scheduler-integration.js";
import { createProgramBriefRepository } from "./program-brief-repository.js";
import { createShowPlanRepository } from "./show-plan-repository.js";
import { createJobRegistry } from "./show-generation-job.js";
import { createShowProjectRepository } from "./show-project-repository.js";
import { createFakeLlmAdapter, createFakeMusicAdapter, createFakeTtsAdapter, createFakeWeatherAdapter, createFakeCalendarAdapter, createFakeDeviceAdapter, createFakeStorySourceAdapter } from "../test/fake-adapters.js";
import type { Track } from "@fakeradio/shared";
import type { ProgramBrief, ShowPlan } from "@fakeradio/shared";
import { createDailyShowPlanGenerator } from "./daily-show-plan-generator.js";
import { createDailySelectionEngine } from "./daily-selection-engine.js";

let testDirs: string[] = [];
let testDailyShowPlanGenerator: ReturnType<typeof createDailyShowPlanGenerator>;

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
    briefRepo: createTestBriefRepo(programsDir),
    planRepo: createTestPlanRepo(programsDir),
    showProjectRepo: createTestShowProjectRepo(showsDir),
    jobRegistry: createTestJobRegistry(programsDir),
    llm: createFakeLlmAdapter(),
    music: createFakeMusicAdapter(),
    tts: createFakeTtsAdapter(),
    ttsCacheDir: join(baseDir, "tts-cache"),
    weather: createFakeWeatherAdapter(),
    calendar: createFakeCalendarAdapter(),
    devices: createFakeDeviceAdapter(),
    storySource: createFakeStorySourceAdapter(),
    likedSongs: {
      list: async () => []
    } as any,
    systemPrompt: "You are a test DJ."
  };
}

describe("scheduler-integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testDailyShowPlanGenerator = createDailyShowPlanGenerator();
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

    it("generates plan for daily-show brief when no active plan exists", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const dailyBrief: ProgramBrief = {
        id: "test-daily-brief-001",
        type: "daily-show",
        scope: "full-show",
        priority: "daily-default",
        status: "scheduled",
        targetDate: "2026-05-14",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(dailyBrief);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-14",
        dailyShowPlanGenerator: testDailyShowPlanGenerator
      };

      await scheduleTonightBriefIfNeeded(deps);

      const plans = await planRepo.list({ briefId: dailyBrief.id, activeOnly: true });
      expect(plans).toHaveLength(1);
      expect(plans[0].active).toBe(true);
      expect(plans[0].briefSnapshot.id).toBe(dailyBrief.id);

      const jobs = await jobRegistry.list({ briefId: dailyBrief.id });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe("running");

      const updatedBrief = await briefRepo.get(dailyBrief.id);
      expect(updatedBrief?.status).toBe("generating");
    });

    it("uses existing plan for daily-show brief when active plan already exists", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const dailyBrief: ProgramBrief = {
        id: "test-daily-brief-002",
        type: "daily-show",
        scope: "full-show",
        priority: "daily-default",
        status: "scheduled",
        targetDate: "2026-05-14",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(dailyBrief);

      const existingPlan: ShowPlan = {
        id: "test-plan-daily-002",
        briefId: dailyBrief.id,
        version: 1,
        active: true,
        briefSnapshot: dailyBrief,
        blocks: [
          {
            role: "morning",
            title: "Morning Block",
            storyGoal: "Morning music",
            selectionGoal: "Pick morning tracks",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: [{ role: "opening-music" }]
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(existingPlan);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-14",
        dailyShowPlanGenerator: testDailyShowPlanGenerator
      };

      await scheduleTonightBriefIfNeeded(deps);

      const plans = await planRepo.list({ briefId: dailyBrief.id, activeOnly: true });
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe(existingPlan.id);

      const jobs = await jobRegistry.list({ briefId: dailyBrief.id });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe("running");
    });

    it("generates daily-show plan with morning/afternoon/evening blocks", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);
      const programsDir = join(baseDir, "programs");
      mkdirSync(programsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);

      const dailyBrief: ProgramBrief = {
        id: "test-daily-brief-003",
        type: "daily-show",
        scope: "full-show",
        priority: "daily-default",
        status: "scheduled",
        targetDate: "2026-05-14",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(dailyBrief);

      const deps: SchedulerIntegrationDeps = {
        briefRepo,
        planRepo,
        jobRegistry,
        targetDate: "2026-05-14",
        dailyShowPlanGenerator: testDailyShowPlanGenerator
      };

      await scheduleTonightBriefIfNeeded(deps);

      const plans = await planRepo.list({ briefId: dailyBrief.id, activeOnly: true });
      expect(plans).toHaveLength(1);
      const plan = plans[0];

      const roles = new Set(plan.blocks.map(b => b.role));
      expect(roles.has("morning")).toBe(true);
      expect(roles.has("afternoon")).toBe(true);
      expect(roles.has("evening")).toBe(true);
      expect(plan.blocks.length).toBeGreaterThanOrEqual(6);
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
        briefRepo,
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createFakeLlmAdapter(),
        music: createFakeMusicAdapter(),
        tts: createFakeTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createFakeWeatherAdapter(),
        calendar: createFakeCalendarAdapter(),
        devices: createFakeDeviceAdapter(),
        storySource: createFakeStorySourceAdapter(),
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

    it("uses block selection goals before generic DJ search queries", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);

      const programsDir = join(baseDir, "programs");
      const showsDir = join(baseDir, "shows");
      mkdirSync(programsDir, { recursive: true });
      mkdirSync(showsDir, { recursive: true });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);
      const showProjectRepo = createTestShowProjectRepo(showsDir);

      const brief: ProgramBrief = {
        id: "test-brief-selection-goal-001",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "generating",
        targetDate: "2026-05-13",
        topic: "蒸汽波",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(brief);

      const plan: ShowPlan = {
        id: "test-plan-selection-goal-001",
        briefId: brief.id,
        version: 1,
        active: true,
        briefSnapshot: brief,
        blocks: [
          {
            role: "opening",
            title: "霓虹幻影：蒸汽波的诞生",
            storyGoal: "解释蒸汽波如何从互联网亚文化中诞生。",
            selectionGoal: "选一首标志性蒸汽波作品，如Macintosh Plus的《リサフランク420 / 現代のコンピュー》。",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(plan);

      const project = await showProjectRepo.create({ briefId: brief.id, slug: "test-selection-goal-show" });
      await showProjectRepo.update(project.id, { activePlanId: plan.id });

      const job = await jobRegistry.create({ briefId: brief.id, planId: plan.id });
      await jobRegistry.start(job.id);

      const vaporwaveTrack: Track = {
        id: "macintosh-plus-420",
        title: "リサフランク420 / 現代のコンピュー",
        artist: "Macintosh Plus",
        album: "Floral Shoppe",
        source: "local",
        audioUrl: "https://example.com/macintosh-plus.mp3"
      };
      const unrelatedTrack: Track = {
        id: "unrelated-track",
        title: "Unrelated",
        artist: "Other Artist",
        source: "local",
        audioUrl: "https://example.com/unrelated.mp3"
      };
      const search = vi.fn(async (query: string) => (
        query.includes("Macintosh Plus") || query.includes("リサフランク420")
          ? [vaporwaveTrack]
          : [unrelatedTrack]
      ));

      const deps: SchedulerExecutionDeps = {
        briefRepo,
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createFakeLlmAdapter(),
        music: {
          search,
          recommend: vi.fn(async () => [unrelatedTrack]),
          resolve: vi.fn(async (track: Track) => track)
        },
        tts: createFakeTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createFakeWeatherAdapter(),
        calendar: createFakeCalendarAdapter(),
        devices: createFakeDeviceAdapter(),
        storySource: createFakeStorySourceAdapter(),
        likedSongs: {
          list: async () => []
        } as any,
        systemPrompt: "You are a test DJ."
      };

      await executeScheduledJob(deps, brief.id, plan.id, job.id);

      expect(search).toHaveBeenCalled();
      expect(search.mock.calls[0][0]).toContain("Macintosh Plus");

      const episodeFiles = readdirSync(project.directoryPath).filter(f => f.startsWith("episode-"));
      expect(episodeFiles).toHaveLength(1);
      const episode = JSON.parse(readFileSync(join(project.directoryPath, episodeFiles[0]), "utf-8"));
      expect(episode.track.id).toBe("macintosh-plus-420");
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
        briefRepo: createTestBriefRepo(programsDir),
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createFakeLlmAdapter(),
        music: createFakeMusicAdapter(),
        tts: createFakeTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createFakeWeatherAdapter(),
        calendar: createFakeCalendarAdapter(),
        devices: createFakeDeviceAdapter(),
        storySource: createFakeStorySourceAdapter(),
        likedSongs: { list: async () => [] } as any,
        systemPrompt: "Test DJ"
      };

      await executeScheduledJob(deps, "non-existent-brief", "non-existent-plan", job.id);

      const updatedJob = await jobRegistry.get(job.id);
      expect(updatedJob?.status).toBe("failed");
    });

    it("uses DailySelectionEngine for daily-show brief to exclude recently played tracks", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);

      const programsDir = join(baseDir, "programs");
      const showsDir = join(baseDir, "shows");
      mkdirSync(programsDir, { recursive: true });
      mkdirSync(showsDir, { recursive: true });

      const recentTrack: Track = {
        id: "recent-track-001",
        title: "Recently Played Song",
        artist: "Recent Artist",
        album: "Recent Album",
        source: "netease"
      };

      const recentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue([recentTrack])
      };

      const dailySelectionEngine = createDailySelectionEngine(recentPlayedRepo, { exclusionWindowDays: 7 });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);
      const showProjectRepo = createTestShowProjectRepo(showsDir);

      const dailyBrief: ProgramBrief = {
        id: "test-daily-brief-exec-001",
        type: "daily-show",
        scope: "full-show",
        priority: "daily-default",
        status: "generating",
        targetDate: "2026-05-14",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(dailyBrief);

      const dailyPlan: ShowPlan = {
        id: "test-daily-plan-exec-001",
        briefId: dailyBrief.id,
        version: 1,
        active: true,
        briefSnapshot: dailyBrief,
        blocks: [
          {
            role: "morning",
            title: "Morning Block",
            storyGoal: "Start the day",
            selectionGoal: "Pick morning tracks",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(dailyPlan);

      const project = await showProjectRepo.create({ briefId: dailyBrief.id, slug: "test-daily-show-001" });
      await showProjectRepo.update(project.id, { activePlanId: dailyPlan.id });

      const job = await jobRegistry.create({ briefId: dailyBrief.id, planId: dailyPlan.id });
      await jobRegistry.start(job.id);

      const deps: SchedulerExecutionDeps = {
        briefRepo,
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createFakeLlmAdapter(),
        music: createFakeMusicAdapter(),
        tts: createFakeTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createFakeWeatherAdapter(),
        calendar: createFakeCalendarAdapter(),
        devices: createFakeDeviceAdapter(),
        storySource: createFakeStorySourceAdapter(),
        likedSongs: {
          list: async () => [{
            id: "recent-track-001",
            title: "Recently Played Song",
            artist: "Recent Artist",
            album: "Recent Album",
            audioUrl: "https://example.com/track1.mp3"
          }]
        } as any,
        systemPrompt: "You are a test DJ.",
        dailySelectionEngine
      };

      await executeScheduledJob(deps, dailyBrief.id, dailyPlan.id, job.id);

      expect(recentPlayedRepo.listRecentlyPlayed).toHaveBeenCalledWith({ sinceDays: 7 });

      const updatedJob = await jobRegistry.get(job.id);
      expect(updatedJob).not.toBeNull();
      const executionLog = updatedJob!.logs.find(l => l.message.includes("DailySelectionEngine"));
      expect(executionLog).toBeDefined();
    });

    it("does not use DailySelectionEngine for theme-show brief", async () => {
      const baseDir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
      testDirs.push(baseDir);

      const programsDir = join(baseDir, "programs");
      const showsDir = join(baseDir, "shows");
      mkdirSync(programsDir, { recursive: true });
      mkdirSync(showsDir, { recursive: true });

      const recentTrack: Track = {
        id: "recent-track-002",
        title: "Recently Played Song",
        artist: "Recent Artist",
        album: "Recent Album",
        source: "netease"
      };

      const recentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue([recentTrack])
      };

      const dailySelectionEngine = createDailySelectionEngine(recentPlayedRepo, { exclusionWindowDays: 7 });

      const briefRepo = createTestBriefRepo(programsDir);
      const planRepo = createTestPlanRepo(programsDir);
      const jobRegistry = createTestJobRegistry(programsDir);
      const showProjectRepo = createTestShowProjectRepo(showsDir);

      const themeBrief: ProgramBrief = {
        id: "test-theme-brief-exec-001",
        type: "theme-show",
        scope: "full-show",
        priority: "user-requested",
        status: "generating",
        targetDate: "2026-05-14",
        topic: "Test Theme",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await briefRepo.save(themeBrief);

      const themePlan: ShowPlan = {
        id: "test-theme-plan-exec-001",
        briefId: themeBrief.id,
        version: 1,
        active: true,
        briefSnapshot: themeBrief,
        blocks: [
          {
            role: "opening",
            title: "Test Opening",
            storyGoal: "Open the show",
            selectionGoal: "Pick opening track",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await planRepo.save(themePlan);

      const project = await showProjectRepo.create({ briefId: themeBrief.id, slug: "test-theme-show-001" });
      await showProjectRepo.update(project.id, { activePlanId: themePlan.id });

      const job = await jobRegistry.create({ briefId: themeBrief.id, planId: themePlan.id });
      await jobRegistry.start(job.id);

      const deps: SchedulerExecutionDeps = {
        briefRepo,
        planRepo,
        showProjectRepo,
        jobRegistry,
        llm: createFakeLlmAdapter(),
        music: createFakeMusicAdapter(),
        tts: createFakeTtsAdapter(),
        ttsCacheDir: join(baseDir, "tts-cache"),
        weather: createFakeWeatherAdapter(),
        calendar: createFakeCalendarAdapter(),
        devices: createFakeDeviceAdapter(),
        storySource: createFakeStorySourceAdapter(),
        likedSongs: {
          list: async () => []
        } as any,
        systemPrompt: "You are a test DJ.",
        dailySelectionEngine
      };

      await executeScheduledJob(deps, themeBrief.id, themePlan.id, job.id);

      expect(recentPlayedRepo.listRecentlyPlayed).not.toHaveBeenCalled();

      const updatedJob = await jobRegistry.get(job.id);
      const dailyLog = updatedJob!.logs.find(l => l.message.includes("DailySelectionEngine"));
      expect(dailyLog).toBeUndefined();
    });
  });
});
