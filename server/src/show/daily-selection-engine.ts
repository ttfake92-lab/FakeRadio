import type { Track, ShowPlan } from "@fakeradio/shared";
import { createThemeSelectionEngine, extractTracksFromSelection, type ThemeSelectionEngine } from "./theme-selection-engine.js";

export type RecentPlayedRepository = {
  listRecentlyPlayed(options?: { sinceDays?: number }): Promise<Track[]>;
};

export type DailySelectionEngineOptions = {
  exclusionWindowDays?: number;
};

export type DailySelectionEngine = {
  selectForPlan(
    plan: ShowPlan,
    userLibrary: Track[],
    externalTracks: Track[],
    userAuthorizedExternalRatio?: number
  ): Promise<ReturnType<ThemeSelectionEngine["selectForPlan"]>>;
};

function buildExcludedTrackIds(recentTracks: Track[]): Set<string> {
  return new Set(recentTracks.map(t => t.id));
}

export function createDailySelectionEngine(
  recentPlayedRepo: RecentPlayedRepository,
  options: DailySelectionEngineOptions = {}
): DailySelectionEngine {
  const themeEngine = createThemeSelectionEngine();

  return {
    async selectForPlan(
      plan: ShowPlan,
      userLibrary: Track[],
      externalTracks: Track[],
      userAuthorizedExternalRatio?: number
    ) {
      let recentTracks: Track[] = [];
      try {
        const queryOptions: { sinceDays?: number } = {};
        if (options.exclusionWindowDays !== undefined) {
          queryOptions.sinceDays = options.exclusionWindowDays;
        }
        recentTracks = await recentPlayedRepo.listRecentlyPlayed(queryOptions);
      } catch {
        recentTracks = [];
      }

      const excludedTrackIds = buildExcludedTrackIds(recentTracks);

      return themeEngine.selectForPlan(plan, userLibrary, externalTracks, userAuthorizedExternalRatio, excludedTrackIds);
    }
  };
}
