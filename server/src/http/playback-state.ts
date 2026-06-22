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
  // 用户在 DJ 聊天里点确认"插到下一首"的曲目。它和 queue（推荐缓冲池）分开存放，
  // 拥有最高播放优先级——episode 端点会先消费它，再走 prewarm / 推荐引擎。
  getPriorityNextTrack(): Track | null;
  // 清掉优先槽。传 matchId 时只在槽内曲目 id 匹配时才清，避免误清（如 /playing 上报的是别的歌）。
  consumePriorityNextTrack(matchId?: string): void;
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
  // 用户点"插到下一首"的曲目；与 queue 分离，避免被推荐缓冲池稀释或被推荐引擎排除后永远播不到。
  let priorityNextTrack: Track | null = null;

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
      // 用户点"插到下一首"：写入优先槽（最高播放优先级），并从推荐缓冲池里去掉同一首避免重复。
      // 不再 unshift 进 queue——queue 是推荐缓冲池，几乎总被 prewarm/推荐抢先消费，插进去的歌根本轮不到播。
      priorityNextTrack = track;
      queue = queue.filter((t) => t.id !== track.id);
    },
    getPriorityNextTrack() {
      return priorityNextTrack;
    },
    consumePriorityNextTrack(matchId) {
      if (matchId !== undefined && (priorityNextTrack?.id !== matchId)) return;
      priorityNextTrack = null;
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
