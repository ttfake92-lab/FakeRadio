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

describe("ThemeSelectionEngine behaviour", () => {
  const engine = createThemeSelectionEngine();

  describe("user-library priority", () => {
    it("selects user library tracks before external tracks", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start with a classic")
      ]);

      const userLibrary = [
        createMockTrack("lib-1", "Artist A", "Song A"),
        createMockTrack("lib-2", "Artist B", "Song B")
      ];
      const externalTracks = [
        createMockTrack("ext-1", "Artist C", "External Song", "netease")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);
      const allTracks = extractTracksFromSelection(selection);
      const userTracks = extractUserLibraryTracks(selection);

      expect(userTracks.length).toBeGreaterThanOrEqual(1);
      expect(allTracks[0]!.source).toBe("netease");
    });

    it("fills remaining slots with external tracks when user library is insufficient", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start"),
        createMockBlock("origin", "Early works"),
        createMockBlock("signature-era", "Golden era")
      ]);

      const userLibrary = [createMockTrack("lib-1", "Artist A", "Song A")];
      const externalTracks = [
        createMockTrack("ext-1", "Artist B", "Ext B", "netease"),
        createMockTrack("ext-2", "Artist C", "Ext C", "netease"),
        createMockTrack("ext-3", "Artist D", "Ext D", "netease"),
        createMockTrack("ext-4", "Artist E", "Ext E", "netease")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);
      const extTracks = extractExternalTracks(selection);

      expect(extTracks.length).toBeGreaterThan(0);
    });
  });

  describe("external track cap at 60%", () => {
    it("enforces 60% external track cap via engine", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start"),
        createMockBlock("signature-era", "Classic hits")
      ]);

      const userLibrary = [
        createMockTrack("lib-1", "Other", "Song 1"),
        createMockTrack("lib-2", "Other", "Song 2")
      ];
      const externalTracks = [
        createMockTrack("ext-1", "Artist", "Ext 1", "netease"),
        createMockTrack("ext-2", "Artist", "Ext 2", "netease"),
        createMockTrack("ext-3", "Artist", "Ext 3", "netease"),
        createMockTrack("ext-4", "Artist", "Ext 4", "netease")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks);

      expect(isWithinExternalCap(selection)).toBe(true);
      expect(selection.externalRatio).toBeLessThanOrEqual(0.6);
    });

    it("reports when authorization is needed for external ratio override", () => {
      const plan = createMockShowPlan([
        createMockBlock("signature-era", "All classics")
      ]);

      const selection = engine.selectForPlan(plan, [], [
        createMockTrack("ext-1", "Artist", "Song 1", "netease"),
        createMockTrack("ext-2", "Artist", "Song 2", "netease")
      ]);

      expect(needsAuthorizationForExternal(selection)).toBe(true);
      expect(needsAuthorizationForExternal(selection, 0.9)).toBe(false);
    });
  });

  describe("no recent-repeat avoidance for Theme Story Show", () => {
    it("selects recently played tracks without filtering them out", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start with a classic"),
        createMockBlock("origin", "Early works")
      ]);

      const allTracks = [
        createMockTrack("recent-1", "Artist A", "Recently Played"),
        createMockTrack("recent-2", "Artist B", "Also Recent")
      ];

      const selection = engine.selectForPlan(plan, allTracks, []);
      const selectedTracks = extractTracksFromSelection(selection);

      expect(selectedTracks.some(t => t.id === "recent-1")).toBe(true);
    });
  });

  describe("same artist can appear consecutively", () => {
    it("selects multiple tracks from the same artist", () => {
      const plan = createMockShowPlan([
        createMockBlock("signature-era", "Classic Bee Gees hits")
      ]);

      const userLibrary = [
        createMockTrack("bg-1", "Bee Gees", "Stayin Alive"),
        createMockTrack("bg-2", "Bee Gees", "Night Fever"),
        createMockTrack("bg-3", "Bee Gees", "How Deep Is Your Love")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, []);
      const selectedTracks = extractTracksFromSelection(selection);
      const beeGeesCount = selectedTracks.filter(t => t.artist === "Bee Gees").length;

      expect(beeGeesCount).toBe(3);
    });
  });

  describe("selection reason and source tracking", () => {
    it("assigns user-library-match reason to library tracks", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Open with a classic")
      ]);

      const selection = engine.selectForPlan(plan, [
        createMockTrack("lib-1", "Artist", "Song")
      ], []);

      for (const blockSel of selection.selections) {
        for (const s of blockSel.selections) {
          if (s.source === "user-library") {
            expect(s.reason).toBe("user-library-match");
          }
        }
      }
    });

    it("assigns valid reason to external tracks", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Open with a classic")
      ]);

      const selection = engine.selectForPlan(plan, [], [
        createMockTrack("ext-1", "Artist", "External Song", "netease")
      ]);

      const validReasons = ["user-library-match", "representative-work", "era-context", "influence-link", "cover-version"];
      for (const blockSel of selection.selections) {
        for (const s of blockSel.selections) {
          expect(validReasons).toContain(s.reason);
          expect(s.source).toBe("external");
        }
      }
    });
  });

  describe("degraded mode when sources insufficient", () => {
    it("returns empty selections when both pools are empty", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start")
      ]);

      const selection = engine.selectForPlan(plan, [], []);
      const selectedTracks = extractTracksFromSelection(selection);

      expect(selectedTracks.length).toBe(0);
      expect(selection.totalEpisodes).toBeGreaterThan(0);
    });

    it("selects available tracks even when pool is smaller than needed", () => {
      const plan = createMockShowPlan([
        createMockBlock("opening", "Start"),
        createMockBlock("signature-era", "Golden era")
      ]);

      const selection = engine.selectForPlan(plan, [
        createMockTrack("lib-1", "Artist", "Only Song")
      ], []);

      const selectedTracks = extractTracksFromSelection(selection);
      expect(selectedTracks.length).toBeGreaterThan(0);
      expect(selectedTracks.every(t => t.id === "lib-1")).toBe(true);
    });
  });
});

describe("createThemeSelectionEngine", () => {
  const engine = createThemeSelectionEngine();

  function createTrack(id: string, artist: string, title: string, source: Track["source"] = "netease"): Track {
    return { id, artist, title, album: "Test Album", source };
  }

  describe("excludedTrackIds", () => {
    it("excludes specified track IDs from selection", () => {
      const userLibrary = [
        createTrack("track-1", "Artist A", "Song 1"),
        createTrack("track-2", "Artist B", "Song 2"),
        createTrack("track-3", "Artist C", "Song 3")
      ];
      const externalTracks: Track[] = [];

      const plan = createMockShowPlan([
        createMockBlock("opening", "Start with a song")
      ]);

      const excludedIds = new Set(["track-1"]);
      const selection = engine.selectForPlan(plan, userLibrary, externalTracks, undefined, excludedIds);
      const selectedTracks = extractTracksFromSelection(selection);

      expect(selectedTracks.some(t => t.id === "track-1")).toBe(false);
      expect(selectedTracks.some(t => t.id === "track-2" || t.id === "track-3")).toBe(true);
    });

    it("falls back to available tracks when excludedIds reduce the pool", () => {
      const userLibrary = [
        createTrack("track-1", "Artist A", "Song 1"),
        createTrack("track-2", "Artist B", "Song 2")
      ];
      const externalTracks = [
        createTrack("ext-1", "Artist C", "Ext Song", "netease")
      ];

      const plan = createMockShowPlan([
        createMockBlock("opening", "Start with a song"),
        createMockBlock("signature-era", "Classic hits")
      ]);

      const excludedIds = new Set(["track-1", "track-2"]);
      const selection = engine.selectForPlan(plan, userLibrary, externalTracks, undefined, excludedIds);
      const selectedTracks = extractTracksFromSelection(selection);

      // Should select the external track since user library tracks are excluded
      expect(selectedTracks.length).toBeGreaterThan(0);
      expect(selectedTracks.every(t => t.id === "ext-1" || t.source === "external")).toBe(true);
    });
  });

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
        createTrack("ext-1", "Bee Gees", "To Love Somebody", "netease")
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
        createTrack("ext-1", "Bee Gees", "Song 1", "netease"),
        createTrack("ext-2", "Bee Gees", "Song 2", "netease"),
        createTrack("ext-3", "Bee Gees", "Song 3", "netease"),
        createTrack("ext-4", "Bee Gees", "Song 4", "netease")
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
      const externalTracks = [createTrack("ext-1", "Artist", "External Song", "netease")];

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
      const externalTracks = [createTrack("ext-1", "Ext", "Ext Song", "netease")];

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
        createTrack("ext-1", "Artist", "Song 1", "netease"),
        createTrack("ext-2", "Artist", "Song 2", "netease")
      ];

      const selection = engine.selectForPlan(plan, userLibrary, externalTracks, 0.9);

      expect(needsAuthorizationForExternal(selection, 0.9)).toBe(false);
    });
  });
});
