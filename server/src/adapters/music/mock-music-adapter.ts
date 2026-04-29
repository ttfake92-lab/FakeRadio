import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../types";

const MOCK_TRACKS: Track[] = [
  {
    id: "mock-track-001",
    title: "Morning Signal",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 184000,
    source: "mock"
  },
  {
    id: "mock-track-002",
    title: "Quiet Compiler",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 206000,
    source: "mock"
  },
  {
    id: "mock-track-003",
    title: "Night Downshift",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 221000,
    source: "mock"
  }
];

export function createMockMusicAdapter(): MusicAdapter {
  return {
    async search() {
      return MOCK_TRACKS;
    },
    async recommend({ limit }) {
      return MOCK_TRACKS.slice(0, limit);
    },
    async resolve(track) {
      return {
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      };
    }
  };
}
