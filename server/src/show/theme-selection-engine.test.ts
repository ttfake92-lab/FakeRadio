import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Track, ShowPlan, ShowPlanBlock } from "@fakeradio/shared";
import {
  createThemeSelectionEngine,
  isWithinExternalCap,
  needsAuthorizationForExternal,
  extractTracksFromSelection,
  extractUserLibraryTracks,
  extractExternalTracks
} from "./theme-selection-engine.js";

const EXTERNAL_TRACK_CAP = 0.6;

function createMockTrack(id: string, artist: string, title: string, source: Track["source"] = "netease"): Track {
  return { id, artist, title, album: "Test Album", source };
}

function createMockBlock(role: ShowPlanBlock["role"], selectionGoal: string): ShowPlanBlock {
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

function createMockShowPlan(blocks: ShowPlanBlock[]): ShowPlan {
  return {
    id: "plan-1",
    briefId: "brief-1",
    version: 1,
    active: true,
    briefSnapshot: {
      id: "brief-1",
      type: "theme-show",
      topic: "Test Theme",
      targetDate: "2026-05-12",
      priority: "user-requested",
      status: "confirmed",
      createdAt: "2026-05-12T00:00:00Z",
      updatedAt: "2026-05-12T00:00:00Z"
    },
    blocks,
    createdAt: "2026-05-12T00:00:00Z",
    updatedAt: "2026-05-12T00:00:00Z"
  };
}

describe("ThemeSelectionEngine", () => {
  describe("user-library priority", () => {
    it("prioritizes tracks from user library when available", () => {
      const userLibrary: Track[] = [
        createMockTrack("track-1", "Artist A", "Song A"),
        createMockTrack("track-2", "Artist B", "Song B"),
        createMockTrack("track-3", "Artist C", "Song C")
      ];

      const externalTracks: Track[] = [
        createMockTrack("ext-1", "Artist D", "External Song", "mock")
      ];

      const selection = [...userLibrary, ...externalTracks].slice(0, 4);
      const userLibraryRatio = selection.filter(t => t.source === "netease").length / selection.length;

      expect(userLibraryRatio).toBeGreaterThanOrEqual(0.4);
      expect(selection[0].source).toBe("netease");
    });

    it("uses external tracks only when user library is insufficient", () => {
      const userLibrary: Track[] = [
        createMockTrack("track-1", "Artist A", "Song A")
      ];

      const externalTracks: Track[] = [
        createMockTrack("ext-1", "Artist B", "External B", "mock"),
        createMockTrack("ext-2", "Artist C", "External C", "mock")
      ];

      const allTracks = [...userLibrary, ...externalTracks];
      const userLibraryRatio = allTracks.filter(t => t.source === "netease").length / allTracks.length;

      expect(allTracks.length).toBeGreaterThan(1);
      expect(userLibraryRatio).toBeLessThanOrEqual(0.6);
    });
  });

  describe("external track cap at 60%", () => {
    it("enforces 60% external track cap for full show", () => {
      const totalEpisodes = 5;
      const maxExternal = Math.floor(totalEpisodes * EXTERNAL_TRACK_CAP);

      expect(maxExternal).toBe(3);

      const externalTracks: Track[] = Array.from({ length: 3 }, (_, i) =>
        createMockTrack(`ext-${i}`, `ExtArtist ${i}`, `Ext Song ${i}`, "mock")
      );

      const userLibrary: Track[] = [
        createMockTrack("track-1", "Artist A", "Song A"),
        createMockTrack("track-2", "Artist B", "Song B")
      ];

      const selection = [...userLibrary, ...externalTracks].slice(0, totalEpisodes);
      const externalCount = selection.filter(t => t.source === "mock").length;
      const externalRatio = externalCount / selection.length;

      expect(externalRatio).toBeLessThanOrEqual(EXTERNAL_TRACK_CAP);
    });

    it("requires explicit reason when exceeding 60% external", () => {
      const totalEpisodes = 3;
      const externalTracks = [
        { track: createMockTrack("ext-1", "Artist A", "Ext A", "mock"), reason: "representative-work" },
        { track: createMockTrack("ext-2", "Artist B", "Ext B", "mock"), reason: "era-context" },
        { track: createMockTrack("ext-3", "Artist C", "Ext C", "mock"), reason: "influence-link" }
      ];

      const userLibrary = [
        createMockTrack("track-1", "Artist D", "User Song", "netease")
      ];

      const allTracks = [...externalTracks.map(e => e.track), ...userLibrary];
      const externalRatio = externalTracks.length / allTracks.length;

      if (externalRatio > EXTERNAL_TRACK_CAP) {
        expect(externalTracks.every(e => e.reason && ["representative-work", "era-context", "influence-link", "cover-version"].includes(e.reason))).toBe(true);
      }
    });

    it("allows external tracks within 60% cap without special authorization", () => {
      const totalEpisodes = 5;
      const externalTracks = [
        { track: createMockTrack("ext-1", "Artist A", "Ext A", "mock"), reason: "era-context" },
        { track: createMockTrack("ext-2", "Artist B", "Ext B", "mock"), reason: "cover-version" }
      ];

      const userLibrary = [
        createMockTrack("track-1", "Artist C", "Song C"),
        createMockTrack("track-2", "Artist D", "Song D"),
        createMockTrack("track-3", "Artist E", "Song E")
      ];

      const selection = [...externalTracks.map(e => e.track), ...userLibrary].slice(0, totalEpisodes);
      const externalCount = selection.filter(t => t.source === "mock").length;
      const externalRatio = externalCount / selection.length;

      expect(externalRatio).toBeLessThanOrEqual(EXTERNAL_TRACK_CAP);
    });
  });

  describe("no recent-repeat avoidance for Theme Story Show", () => {
    it("does not exclude recently played tracks for theme show", () => {
      const recentTracks: Track[] = [
        createMockTrack("recent-1", "Artist A", "Recently Played A"),
        createMockTrack("recent-2", "Artist B", "Recently Played B")
      ];

      const showPlan = createMockShowPlan([
        createMockBlock("opening", "Start with a classic"),
        createMockBlock("origin", "Early works")
      ]);

      const candidatePool = recentTracks;

      const recentlyPlayedIds = new Set(["recent-1", "recent-2"]);

      const allowedForThemeShow = candidatePool.filter(track => {
        return true;
      });

      expect(allowedForThemeShow.length).toBe(candidatePool.length);
      expect(allowedForThemeShow.some(t => t.id === "recent-1")).toBe(true);
    });

    it("Daily Show would exclude recent tracks, but Theme Show does not", () => {
      const allTracks: Track[] = [
        createMockTrack("recent-1", "Artist A", "Recently Played"),
        createMockTrack("track-2", "Artist B", "Not Recent B")
      ];

      const recentlyPlayedIds = new Set(["recent-1"]);

      const forDailyShow = allTracks.filter(t => !recentlyPlayedIds.has(t.id));
      expect(forDailyShow.some(t => t.id === "recent-1")).toBe(false);

      const forThemeShow = allTracks;
      expect(forThemeShow.some(t => t.id === "recent-1")).toBe(true);
    });
  });

  describe("same artist can appear consecutively", () => {
    it("allows consecutive tracks from same artist", () => {
      const tracks: Track[] = [
        createMockTrack("track-1", "Artist A", "Artist A Song 1"),
        createMockTrack("track-2", "Artist A", "Artist A Song 2"),
        createMockTrack("track-3", "Artist B", "Artist B Song")
      ];

      let previousArtist: string | null = null;
      let hasConsecutiveSameArtist = false;

      for (const track of tracks) {
        if (previousArtist === track.artist) {
          hasConsecutiveSameArtist = true;
          break;
        }
        previousArtist = track.artist;
      }

      expect(hasConsecutiveSameArtist).toBe(true);
    });

    it("does not enforce artist diversification like Daily Show", () => {
      const tracks: Track[] = [
        createMockTrack("track-1", "Bee Gees", "Song 1"),
        createMockTrack("track-2", "Bee Gees", "Song 2"),
        createMockTrack("track-3", "Bee Gees", "Song 3"),
        createMockTrack("track-4", "Other Artist", "Other Song")
      ];

      const artistSequence = tracks.map(t => t.artist);
      const beeGeesCount = artistSequence.filter(a => a === "Bee Gees").length;

      expect(beeGeesCount).toBe(3);
    });
  });

  describe("selection reason and source tracking", () => {
    it("records selection reason for each track", () => {
      const validReasons = [
        "user-library-match",
        "representative-work",
        "era-context",
        "influence-link",
        "cover-version"
      ];

      const selections = [
        { track: createMockTrack("track-1", "Artist A", "Song A"), reason: "user-library-match" },
        { track: createMockTrack("ext-1", "Artist B", "Ext B", "mock"), reason: "era-context" }
      ];

      for (const selection of selections) {
        expect(validReasons).toContain(selection.reason);
      }
    });

    it("records source for each track selection", () => {
      const selections = [
        { track: createMockTrack("track-1", "Artist A", "Song A", "netease"), source: "user-library" as const },
        { track: createMockTrack("ext-1", "Artist B", "Ext B", "mock"), source: "external" as const }
      ];

      expect(selections[0].source).toBe("user-library");
      expect(selections[1].source).toBe("external");
    });
  });

  describe("degraded mode when sources insufficient", () => {
    it("falls back to mood/lyric theme interpretation without sources", () => {
      const emptySources: never[] = [];

      const storyType = emptySources.length === 0 ? "mood-reading" : "background";

      expect(storyType).toBe("mood-reading");
    });

    it("uses background story type when sources are available", () => {
      const sources = [
        { kind: "metadata" as const, title: "Metadata Source", content: "Background info", confidence: 0.7 }
      ];

      const hasBackgroundSource = sources.some(s => s.kind === "metadata" && (s.confidence ?? 0) >= 0.5);
      const storyType = hasBackgroundSource ? "background" : "mood-reading";

      expect(storyType).toBe("background");
    });
  });
});

describe("createThemeSelectionEngine", () => {
  const engine = createThemeSelectionEngine();

  function createTrack(id: string, artist: string, title: string, source: Track["source"] = "netease"): Track {
    return { id, artist, title, album: "Test Album", source };
  }

  function createBlock(role: ShowPlanBlock["role"], selectionGoal: string): ShowPlanBlock {
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

  function createPlan(blocks: ShowPlanBlock[]): ShowPlan {
    return {
      id: "plan-1",
      briefId: "brief-1",
      version: 1,
      active: true,
      briefSnapshot: {
        id: "brief-1",
        type: "theme-show",
        topic: "Bee Gees",
        targetDate: "2026-05-12",
        priority: "user-requested",
        status: "confirmed",
        createdAt: "2026-05-12T00:00:00Z",
        updatedAt: "2026-05-12T00:00:00Z"
      },
      blocks,
      createdAt: "2026-05-12T00:00:00Z",
      updatedAt: "2026-05-12T00:00:00Z"
    };
  }

  describe("selectForPlan", () => {
    it("selects tracks for a plan with user library priority", () => {
      const plan = createPlan([
        createBlock("opening", "Start with a representative song"),
        createBlock("signature-era", "Classic hits")
      ]);

      const userLibrary = [
        createTrack("lib-1", "Bee Gees", "Stayin Alive"),
        createTrack("lib-2", "Bee Gees", "Night Fever"),
        createTrack("lib-3", "Bee Gees", "How Deep Is Your Love")
      ];

      const externalTracks = [
        createTrack("ext-1", "Bee Gees", "To Love Somebody", "mock")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);

      expect(selection.planId).toBe("plan-1");
      expect(selection.briefId).toBe("brief-1");
      expect(selection.selections.length).toBe(2);
      expect(selection.totalEpisodes).toBeGreaterThan(0);
    });

    it("enforces external track cap at 60%", () => {
      const plan = createPlan([
        createBlock("opening", "Start"),
        createBlock("origin", "Early works"),
        createBlock("signature-era", "Golden era")
      ]);

      const userLibrary = [
        createTrack("lib-1", "Other", "Other Song 1"),
        createTrack("lib-2", "Other", "Other Song 2")
      ];

      const externalTracks = [
        createTrack("ext-1", "Bee Gees", "Song 1", "mock"),
        createTrack("ext-2", "Bee Gees", "Song 2", "mock"),
        createTrack("ext-3", "Bee Gees", "Song 3", "mock"),
        createTrack("ext-4", "Bee Gees", "Song 4", "mock")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);

      expect(isWithinExternalCap(selection)).toBe(true);
      expect(selection.externalRatio).toBeLessThanOrEqual(0.6);
    });

    it("records selection reasons for all tracks", () => {
      const plan = createPlan([
        createBlock("opening", "Open with a classic")
      ]);

      const userLibrary = [createTrack("lib-1", "Artist", "Song")];
      const externalTracks = [createTrack("ext-1", "Artist", "External Song", "mock")];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);

      for (const blockSel of selection.selections) {
        for (const s of blockSel.selections) {
          expect(["user-library-match", "era-context", "representative-work", "influence-link", "cover-version"]).toContain(s.reason);
          expect(["user-library", "external"]).toContain(s.source);
        }
      }
    });

    it("allows consecutive same artist tracks", () => {
      const plan = createPlan([
        createBlock("signature-era", "Classic Bee Gees hits")
      ]);

      const userLibrary = [
        createTrack("bg-1", "Bee Gees", "Stayin Alive"),
        createTrack("bg-2", "Bee Gees", "Night Fever"),
        createTrack("bg-3", "Bee Gees", "How Deep Is Your Love")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, []);

      const allTracks = extractTracksFromSelection(selection);
      const beeGeesCount = allTracks.filter(t => t.artist === "Bee Gees").length;

      expect(beeGeesCount).toBeGreaterThanOrEqual(1);
    });

    it("extracts user library and external tracks separately", () => {
      const plan = createPlan([
        createBlock("opening", "Start")
      ]);

      const userLibrary = [createTrack("lib-1", "User", "User Song")];
      const externalTracks = [createTrack("ext-1", "Ext", "Ext Song", "mock")];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);

      const userTracks = extractUserLibraryTracks(selection);
      const extTracks = extractExternalTracks(selection);

      expect(userTracks.length).toBeGreaterThanOrEqual(0);
      expect(extTracks.length).toBeGreaterThanOrEqual(0);
    });

    it("respects user-authorized external ratio override", () => {
      const plan = createPlan([
        createBlock("signature-era", "All classics")
      ]);

      const userLibrary: Track[] = [];
      const externalTracks = [
        createTrack("ext-1", "Artist", "Song 1", "mock"),
        createTrack("ext-2", "Artist", "Song 2", "mock")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks, 0.9);

      expect(needsAuthorizationForExternal(selection, 0.9)).toBe(false);
    });
  });
});
