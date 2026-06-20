import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../adapters/types.js";
import type { StateRepository } from "../state/state-repository.js";
import type { StreamBroadcaster } from "../realtime/stream-bus.js";
import type { PlaybackState } from "./playback-state.js";

export type EnqueueSuggestedTracksDeps = {
  music: MusicAdapter;
  state: PlaybackState;
  stateRepo?: StateRepository;
  stream: StreamBroadcaster;
};

export async function enqueueSuggestedTracks(
  query: string,
  deps: EnqueueSuggestedTracksDeps,
  limit = 3
): Promise<Track[]> {
  const currentTrack = deps.state.getCurrentTrack();
  const queue = deps.state.getQueue();
  const excludedTrackIds = new Set([
    ...deps.state.getRecentlySelectedTrackIds(),
    ...(currentTrack ? [currentTrack.id] : []),
    ...queue.map((track) => track.id)
  ]);

  const candidates = await deps.music.search(query);
  const resolved: Track[] = [];
  for (const candidate of candidates) {
    if (resolved.length >= limit) break;
    if (excludedTrackIds.has(candidate.id)) continue;
    try {
      const track = await deps.music.resolve(candidate);
      if (excludedTrackIds.has(track.id)) continue;
      excludedTrackIds.add(track.id);
      resolved.push(track);
    } catch {
      // Skip unresolvable search results; another candidate may still work.
    }
  }

  if (resolved.length === 0) return [];

  const nextQueue = [...queue, ...resolved];
  deps.state.setQueue(nextQueue);
  deps.stream.broadcast({ type: "queue-updated", payload: { queue: nextQueue } });
  await deps.stateRepo?.snapshotQueue(nextQueue, null);
  return resolved;
}
