import type { Track, ShowPlan, ShowPlanBlock } from "@fakeradio/shared";

export const SELECTION_REASONS = [
  "user-library-match",
  "representative-work",
  "era-context",
  "influence-link",
  "cover-version"
] as const;

export type SelectionReason = (typeof SELECTION_REASONS)[number];

export type TrackSelection = {
  track: Track;
  reason: SelectionReason;
  source: "user-library" | "external";
  externalReason?: string;
};

export type BlockSelection = {
  block: ShowPlanBlock;
  selections: TrackSelection[];
};

export type ShowSelection = {
  planId: string;
  briefId: string;
  selections: BlockSelection[];
  totalEpisodes: number;
  externalCount: number;
  externalRatio: number;
};

export type ThemeSelectionEngine = {
  selectForPlan(
    plan: ShowPlan,
    userLibrary: Track[],
    externalTracks: Track[],
    userAuthorizedExternalRatio?: number
  ): ShowSelection;
};

const EXTERNAL_TRACK_CAP = 0.6;

function computeExternalCap(userAuthorizedRatio?: number): number {
  return userAuthorizedRatio ?? EXTERNAL_TRACK_CAP;
}

function buildTrackIndex(tracks: Track[]): Map<string, Track> {
  const index = new Map<string, Track>();
  for (const track of tracks) {
    index.set(track.id, track);
  }
  return index;
}

function selectTracksForBlock(
  block: ShowPlanBlock,
  userLibrary: Track[],
  externalTracks: Track[],
  externalCap: number,
  totalNeeded: number,
  existingSelections: TrackSelection[]
): TrackSelection[] {
  const selections: TrackSelection[] = [...existingSelections];
  const usedIds = new Set(selections.map(s => s.track.id));

  const remainingUserLibrary = userLibrary.filter(t => !usedIds.has(t.id));
  const remainingExternal = externalTracks.filter(t => !usedIds.has(t.id));

  const currentExternal = selections.filter(s => s.source === "external").length;
  const currentTotal = selections.length;
  const maxExternal = Math.floor(totalNeeded * externalCap);

  for (const track of remainingUserLibrary) {
    if (selections.length >= totalNeeded) break;
    selections.push({
      track,
      reason: "user-library-match",
      source: "user-library"
    });
    usedIds.add(track.id);
  }

  for (const track of remainingExternal) {
    if (selections.length >= totalNeeded) break;
    if (currentExternal >= maxExternal && currentTotal > 0) break;

    const externalReason = inferExternalReason(block, track);
    selections.push({
      track,
      reason: "era-context",
      source: "external",
      externalReason
    });
    usedIds.add(track.id);
  }

  return selections;
}

function inferExternalReason(block: ShowPlanBlock, track: Track): string {
  const goal = block.selectionGoal.toLowerCase();
  if (goal.includes("影响") || goal.includes("influence")) {
    return "influence-link";
  }
  if (goal.includes("时代") || goal.includes("era")) {
    return "era-context";
  }
  if (goal.includes("代表") || goal.includes("signature")) {
    return "representative-work";
  }
  if (track.title.toLowerCase().includes("cover") || track.title.includes("翻唱")) {
    return "cover-version";
  }
  return "representative-work";
}

function calculateEpisodeTargetsForBlock(block: ShowPlanBlock): number {
  if (block.episodeTargets.length > 0) {
    return Math.max(1, block.episodeTargets.length);
  }

  const roleToDefaultCount: Record<ShowPlanBlock["role"], number> = {
    "opening": 1,
    "closing": 1,
    "origin": 2,
    "turning-point": 2,
    "signature-era": 3,
    "relationship": 2,
    "influence": 2,
    "contrast": 1,
    "personal-anchor": 2
  };

  return roleToDefaultCount[block.role] ?? 2;
}

export function createThemeSelectionEngine(): ThemeSelectionEngine {
  return {
    selectForPlan(
      plan: ShowPlan,
      userLibrary: Track[],
      externalTracks: Track[],
      userAuthorizedExternalRatio?: number
    ): ShowSelection {
      const externalCap = computeExternalCap(userAuthorizedExternalRatio);
      const userIndex = buildTrackIndex(userLibrary);

      const selections: BlockSelection[] = [];
      let totalEpisodes = 0;
      let externalCount = 0;

      for (const block of plan.blocks) {
        const episodeCount = calculateEpisodeTargetsForBlock(block);
        totalEpisodes += episodeCount;

        const blockSelections = selectTracksForBlock(
          block,
          userLibrary,
          externalTracks,
          externalCap,
          episodeCount,
          []
        );

        externalCount += blockSelections.filter(s => s.source === "external").length;

        selections.push({
          block,
          selections: blockSelections
        });
      }

      const effectiveExternal = externalCount;
      const externalRatio = totalEpisodes > 0 ? effectiveExternal / totalEpisodes : 0;

      return {
        planId: plan.id,
        briefId: plan.briefId,
        selections,
        totalEpisodes,
        externalCount: effectiveExternal,
        externalRatio
      };
    }
  };
}

export function isWithinExternalCap(selection: ShowSelection, userAuthorizedRatio?: number): boolean {
  const cap = computeExternalCap(userAuthorizedRatio);
  return selection.externalRatio <= cap;
}

export function needsAuthorizationForExternal(selection: ShowSelection, userAuthorizedRatio?: number): boolean {
  return !isWithinExternalCap(selection, userAuthorizedRatio);
}

export function extractTracksFromSelection(selection: ShowSelection): Track[] {
  return selection.selections.flatMap(blockSel => blockSel.selections.map(s => s.track));
}

export function extractUserLibraryTracks(selection: ShowSelection): Track[] {
  return selection.selections
    .flatMap(blockSel => blockSel.selections)
    .filter(s => s.source === "user-library")
    .map(s => s.track);
}

export function extractExternalTracks(selection: ShowSelection): Track[] {
  return selection.selections
    .flatMap(blockSel => blockSel.selections)
    .filter(s => s.source === "external")
    .map(s => s.track);
}
