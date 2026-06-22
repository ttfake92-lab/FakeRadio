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
  insertNext(track: Track): void;
  queueSize(): number;
  buildNowResponse(): NowResponse;
};

const RECENTLY_SELECTED_TRACK_LIMIT = 200;

export function createPlaybackState(initialQueue: Track[] = [], initialRecentlySelectedTrackIds: string[] = []): PlaybackState {
  let currentTrack: Track | null = null;
  let currentDj: NowResponse["dj"] = { say: "FakeRadio 准备好了。" };
  let recentlySelectedTrackIds: string[] = [...new Set(initialRecentlySelectedTrackIds)].slice(0, RECENTLY_SELECTED_TRACK_LIMIT);
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
      ].slice(0, RECENTLY_SELECTED_TRACK_LIMIT);
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
    insertNext(track) {
      // 插到队首 = 当前正在播的下一首；去重避免同一首重复。
      queue = [track, ...queue.filter((t) => t.id !== track.id)];
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
