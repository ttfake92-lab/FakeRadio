import { NowResponseSchema, type NowResponse, type Track } from "@fakeradio/shared";

export type PlaybackState = {
  getCurrentTrack(): Track | null;
  getCurrentDj(): NowResponse["dj"];
  getQueue(): Track[];
  getRecentlySelectedTrackIds(): string[];
  getLastPlanBlockAt(): string | null;
  setTrack(track: Track | null): void;
  setDj(dj: NowResponse["dj"]): void;
  setQueue(queue: Track[]): void;
  setLastPlanBlockAt(at: string | null): void;
  rememberSelectedTrack(track: Track): void;
  selectCandidate(tracks: Track[]): Track | undefined;
  removeFromQueue(trackId: string): void;
  queueSize(): number;
  buildNowResponse(): NowResponse;
};

export function createPlaybackState(initialQueue: Track[] = [], initialRecentlySelectedTrackIds: string[] = []): PlaybackState {
  let currentTrack: Track | null = null;
  let currentDj: NowResponse["dj"] = { say: "FakeRadio 准备好了。" };
  let recentlySelectedTrackIds: string[] = [...new Set(initialRecentlySelectedTrackIds)].slice(0, 50);
  let queue: Track[] = initialQueue;
  let lastPlanBlockAt: string | null = null;

  return {
    getCurrentTrack() {
      return currentTrack;
    },
    getCurrentDj() {
      return currentDj;
    },
    getQueue() {
      return queue;
    },
    getRecentlySelectedTrackIds() {
      return recentlySelectedTrackIds;
    },
    getLastPlanBlockAt() {
      return lastPlanBlockAt;
    },
    setTrack(track) {
      currentTrack = track;
    },
    setDj(dj) {
      currentDj = dj;
    },
    setQueue(newQueue) {
      queue = newQueue;
    },
    setLastPlanBlockAt(at) {
      lastPlanBlockAt = at;
    },
    rememberSelectedTrack(track) {
      recentlySelectedTrackIds = [
        track.id,
        ...recentlySelectedTrackIds.filter((id) => id !== track.id)
      ].slice(0, 50);
    },
    selectCandidate(tracks) {
      const excludedTrackIds = new Set([
        ...recentlySelectedTrackIds,
        ...(currentTrack ? [currentTrack.id] : []),
        ...queue.map(t => t.id)
      ]);
      return tracks.find((track) => !excludedTrackIds.has(track.id));
    },
    removeFromQueue(trackId) {
      queue = queue.filter((t) => t.id !== trackId);
    },
    queueSize() {
      return queue.length;
    },
    buildNowResponse() {
      return NowResponseSchema.parse({
        playback: currentTrack ? "playing" : "idle",
        track: currentTrack,
        dj: currentDj,
        queue,
        updatedAt: new Date().toISOString()
      });
    }
  };
}
