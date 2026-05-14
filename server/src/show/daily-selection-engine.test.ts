import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Track, ShowPlan, ShowPlanBlock } from "@fakeradio/shared";
import {
  createThemeSelectionEngine,
  extractTracksFromSelection
} from "./theme-selection-engine.js";
import { createDailySelectionEngine } from "./daily-selection-engine.js";

function makeTrack(id: string, artist: string, title: string, source: Track["source"] = "netease"): Track {
  return { id, artist, title, album: "Test Album", source };
}

function makeBlock(role: ShowPlanBlock["role"], selectionGoal: string): ShowPlanBlock {
  return {
    role,
    title: `Test ${role}`,
    storyGoal: `Story for ${role}`,
    selectionGoal,
    sourceNeeds: [],
    constraints: {},
    episodeTargets: []
  };
}

function makePlan(briefId: string, blocks: ShowPlanBlock[]): ShowPlan {
  return {
    id: `plan-${briefId}`,
    briefId,
    version: 1,
    active: true,
    briefSnapshot: {
      id: briefId,
      type: "daily-show",
      topic: "Daily Show",
      targetDate: new Date().toISOString().slice(0, 10),
      priority: "daily-default",
      status: "confirmed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    blocks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe("DailySelectionEngine", () => {
  describe("strong recent-play exclusion", () => {
    it("excludes recently played tracks from daily show selection", async () => {
      const recentTracks = [
        makeTrack("recent-1", "Artist A", "Recently Played A"),
        makeTrack("recent-2", "Artist B", "Recently Played B"),
        makeTrack("recent-3", "Artist C", "Recently Played C")
      ];

      const library = [
        makeTrack("recent-1", "Artist A", "Recently Played A"),
        makeTrack("recent-2", "Artist B", "Recently Played B"),
        makeTrack("recent-3", "Artist C", "Recently Played C"),
        makeTrack("fresh-1", "Artist D", "Fresh Track D"),
        makeTrack("fresh-2", "Artist E", "Fresh Track E")
      ];

      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue(recentTracks)
      };

      const plan = makePlan("daily-001", [
        makeBlock("opening", "Start fresh"),
        makeBlock("signature-era", "Main segment")
      ]);

      const engine = createDailySelectionEngine(mockRecentPlayedRepo);
      const selection = await engine.selectForPlan(plan, library, []);

      const selectedIds = extractTracksFromSelection(selection).map(t => t.id);

      expect(selectedIds.some(id => id === "recent-1")).toBe(false);
      expect(selectedIds.some(id => id === "recent-2")).toBe(false);
      expect(selectedIds.some(id => id === "recent-3")).toBe(false);
      expect(mockRecentPlayedRepo.listRecentlyPlayed).toHaveBeenCalled();
    });

    it("respects exclusion window in days", async () => {
      const recentTracks = [makeTrack("recent-1", "Artist A", "Recently Played")];
      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<(options?: { sinceDays?: number }) => Promise<Track[]>>().mockResolvedValue(recentTracks)
      };

      const plan = makePlan("daily-002", [makeBlock("opening", "Start")]);
      const library = [makeTrack("recent-1", "Artist A", "Recently Played"), makeTrack("fresh-1", "Artist B", "Fresh")];

      const engine = createDailySelectionEngine(mockRecentPlayedRepo, { exclusionWindowDays: 14 });
      await engine.selectForPlan(plan, library, []);

      expect(mockRecentPlayedRepo.listRecentlyPlayed).toHaveBeenCalledWith({ sinceDays: 14 });
    });

    it("handles empty recent played list gracefully", async () => {
      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue([])
      };

      const plan = makePlan("daily-003", [makeBlock("opening", "Start fresh")]);
      const library = [
        makeTrack("track-1", "Artist A", "Song A"),
        makeTrack("track-2", "Artist B", "Song B")
      ];

      const engine = createDailySelectionEngine(mockRecentPlayedRepo);
      const selection = await engine.selectForPlan(plan, library, []);

      const selectedIds = extractTracksFromSelection(selection).map(t => t.id);
      expect(selectedIds).toContain("track-1");
      expect(selectedIds.length).toBeGreaterThanOrEqual(1);
    });

    it("falls back to all tracks when recent played repo throws", async () => {
      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockRejectedValue(new Error("DB unavailable"))
      };

      const plan = makePlan("daily-004", [makeBlock("opening", "Start")]);
      const library = [
        makeTrack("track-1", "Artist A", "Song A"),
        makeTrack("track-2", "Artist B", "Song B")
      ];

      const engine = createDailySelectionEngine(mockRecentPlayedRepo);
      await expect(engine.selectForPlan(plan, library, [])).resolves.toBeDefined();
    });
  });

  describe("same behavior as ThemeSelectionEngine for non-recent concerns", () => {
    it("enforces external track cap at 60% for daily show", async () => {
      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue([])
      };

      const plan = makePlan("daily-005", [
        makeBlock("opening", "Start"),
        makeBlock("origin", "Early"),
        makeBlock("signature-era", "Golden era")
      ]);

      const userLibrary = [
        makeTrack("lib-1", "Other", "Other Song 1"),
        makeTrack("lib-2", "Other", "Other Song 2")
      ];

      const externalTracks = [
        makeTrack("ext-1", "Artist X", "Song X", "mock"),
        makeTrack("ext-2", "Artist Y", "Song Y", "mock"),
        makeTrack("ext-3", "Artist Z", "Song Z", "mock"),
        makeTrack("ext-4", "Artist W", "Song W", "mock")
      ];

      const engine = createDailySelectionEngine(mockRecentPlayedRepo);
      const selection = await engine.selectForPlan(plan, userLibrary, externalTracks);

      expect(selection.externalRatio).toBeLessThanOrEqual(0.6);
    });

    it("returns the same selection interface as ThemeSelectionEngine", async () => {
      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue([])
      };

      const plan = makePlan("daily-006", [makeBlock("opening", "Start")]);
      const library = [makeTrack("track-1", "Artist A", "Song A")];

      const engine = createDailySelectionEngine(mockRecentPlayedRepo);
      const selection = await engine.selectForPlan(plan, library, []);

      expect(selection).toHaveProperty("planId");
      expect(selection).toHaveProperty("briefId");
      expect(selection).toHaveProperty("selections");
      expect(selection).toHaveProperty("totalEpisodes");
      expect(selection).toHaveProperty("externalCount");
      expect(selection).toHaveProperty("externalRatio");
    });
  });

  describe("Daily vs Theme behavior difference", () => {
    it("Daily Show excludes recent tracks, Theme Show does not", async () => {
      const recentTracks = [makeTrack("recent-1", "Artist A", "Recently Played")];

      const mockRecentPlayedRepo = {
        listRecentlyPlayed: vi.fn<() => Promise<Track[]>>().mockResolvedValue(recentTracks)
      };

      const dailyPlan = makePlan("daily-007", [makeBlock("opening", "Daily")]);
      const themePlan: ShowPlan = {
        ...dailyPlan,
        id: "plan-theme",
        briefId: "theme-001",
        briefSnapshot: { ...dailyPlan.briefSnapshot, id: "theme-001", type: "theme-show" }
      };

      const library = [
        makeTrack("recent-1", "Artist A", "Recently Played"),
        makeTrack("track-2", "Artist B", "Fresh B")
      ];

      const dailyEngine = createDailySelectionEngine(mockRecentPlayedRepo);
      const dailySelection = await dailyEngine.selectForPlan(dailyPlan, library, []);
      const dailyIds = extractTracksFromSelection(dailySelection).map(t => t.id);

      const themeEngine = createThemeSelectionEngine();
      const themeSelection = themeEngine.selectForPlan(themePlan, library, []);
      const themeIds = extractTracksFromSelection(themeSelection).map(t => t.id);

      expect(dailyIds).not.toContain("recent-1");
      expect(themeIds).toContain("recent-1");
    });
  });
});
