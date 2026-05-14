import type { Track } from "@fakeradio/shared";
import type { StateRepository, PlayedTrack } from "../state/state-repository.js";
import type { RecentPlayedRepository } from "./daily-selection-engine.js";

function playedTrackToTrack(pt: PlayedTrack): Track {
  return {
    id: pt.trackId,
    title: pt.title,
    artist: pt.artist,
    album: pt.album ?? undefined,
    source: pt.source as Track["source"],
    durationMs: undefined,
    artworkUrl: undefined,
    audioUrl: undefined
  };
}

export function createStateRecentPlayedRepository(
  stateRepo: StateRepository
): RecentPlayedRepository {
  return {
    async listRecentlyPlayed(options) {
      const sinceDays = options?.sinceDays;
      const since = sinceDays
        ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
      const playedTracks = await stateRepo.getRecentlyPlayed(200, since);
      return playedTracks.map(playedTrackToTrack);
    }
  };
}
