import type { Track } from "@fakeradio/shared";

export type TrackRegistry = {
  register(track: Track): void;
  get(trackId: string): Track | undefined;
};

export function createTrackRegistry(): TrackRegistry {
  const tracks = new Map<string, Track>();

  return {
    register(track) {
      if (track.audioUrl) {
        tracks.set(track.id, track);
      }
    },
    get(trackId) {
      return tracks.get(trackId);
    }
  };
}
