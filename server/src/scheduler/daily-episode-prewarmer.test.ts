import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Track } from "@fakeradio/shared";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMockLlmAdapter,
  createMockStorySourceAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter
} from "../adapters/index.js";
import type { MusicAdapter } from "../adapters/types.js";
import { createStateRepository } from "../state/state-repository.js";
import type { LikedSongsRepository } from "../user/liked-songs-repository.js";
import { runPrewarmForDate, type PrewarmDeps } from "./daily-episode-prewarmer.js";

const TRACKS: Track[] = [
  {
    id: "mock-track-001",
    title: "Morning Signal",
    artist: "FakeRadio Session",
    durationMs: 184000,
    source: "mock"
  },
  {
    id: "mock-track-002",
    title: "Quiet Compiler",
    artist: "FakeRadio Session",
    durationMs: 206000,
    source: "mock"
  },
  {
    id: "mock-track-003",
    title: "Night Downshift",
    artist: "FakeRadio Session",
    durationMs: 221000,
    source: "mock"
  },
  {
    id: "mock-track-004",
    title: "Afternoon Haze",
    artist: "FakeRadio Session",
    durationMs: 195000,
    source: "mock"
  },
  {
    id: "mock-track-005",
    title: "Evening Protocol",
    artist: "FakeRadio Session",
    durationMs: 212000,
    source: "mock"
  },
  {
    id: "mock-track-006",
    title: "Midnight Thread",
    artist: "FakeRadio Session",
    durationMs: 198000,
    source: "mock"
  }
];

const tempDirs: string[] = [];

function createPrewarmDeps(): PrewarmDeps {
  const baseDir = mkdtempSync(join(tmpdir(), "fakeradio-prewarm-test-"));
  tempDirs.push(baseDir);
  const music: MusicAdapter = {
    async search() {
      return TRACKS;
    },
    async recommend({ limit }) {
      return TRACKS.slice(0, limit);
    },
    async resolve(track) {
      return track;
    }
  };
  const likedSongs: LikedSongsRepository = {
    async list() {
      return [];
    },
    async refreshFromRawExport() {
      return [];
    }
  };

  return {
    llm: createMockLlmAdapter(),
    music,
    tts: createMockTtsAdapter(),
    ttsCacheDir: join(baseDir, "tts"),
    weather: createMockWeatherAdapter(),
    calendar: createMockCalendarAdapter(),
    devices: createMockDeviceAdapter(),
    storySource: createMockStorySourceAdapter(),
    publicMetadataAdapter: createMockStorySourceAdapter(),
    webResearchAdapter: createMockStorySourceAdapter(),
    likedSongs,
    stateRepo: createStateRepository(join(baseDir, "fakeradio.db")),
    nowProvider: () => new Date(2026, 3, 30, 23, 30, 0),
    audioDir: join(baseDir, "audio")
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("runPrewarmForDate", () => {
  it("prepares distinct tracks within the same block", async () => {
    const deps = createPrewarmDeps();

    const results = await runPrewarmForDate(
      deps,
      "2026-05-01",
      [{ at: "07:00", label: "早晨", moodHint: "warm morning indie" }],
      3,
      "你是 FakeRadio DJ。"
    );

    expect(results).toEqual([{ blockAt: "07:00", prepared: 3, failed: 0, errors: [] }]);

    const claimed = await Promise.all([
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00")
    ]);
    const trackIds = claimed.map((entry) => entry?.episode.track.id);

    expect(new Set(trackIds).size).toBe(3);
  });

  it("does not repeat tracks across blocks in the same prewarm run", async () => {
    const deps = createPrewarmDeps();

    const results = await runPrewarmForDate(
      deps,
      "2026-05-01",
      [
        { at: "07:00", label: "早晨", moodHint: "warm morning indie" },
        { at: "09:00", label: "上午", moodHint: "deep focus" }
      ],
      2,
      "你是 FakeRadio DJ。"
    );

    expect(results).toEqual([
      { blockAt: "07:00", prepared: 2, failed: 0, errors: [] },
      { blockAt: "09:00", prepared: 2, failed: 0, errors: [] }
    ]);

    const claimed = await Promise.all([
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "09:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "09:00")
    ]);
    const trackIds = claimed.map((entry) => entry?.episode.track.id);

    expect(new Set(trackIds).size).toBe(4);
  });

  it("Daily Show avoids recently played tracks from state repository", async () => {
    const deps = createPrewarmDeps();

    await deps.stateRepo.recordPlayedTrack({
      id: "played-001",
      trackId: "mock-track-001",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      album: null,
      source: "mock",
      playedAt: new Date(2026, 3, 30, 10, 0, 0).toISOString()
    });

    const results = await runPrewarmForDate(
      deps,
      "2026-05-01",
      [{ at: "07:00", label: "早晨", moodHint: "warm morning indie" }],
      3,
      "你是 FakeRadio DJ。"
    );

    expect(results).toEqual([{ blockAt: "07:00", prepared: 3, failed: 0, errors: [] }]);

    const claimed = await Promise.all([
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00"),
      deps.stateRepo.claimPreparedEpisode("2026-05-01", "07:00")
    ]);
    const trackIds = claimed.map((entry) => entry?.episode.track.id);

    expect(trackIds).not.toContain("mock-track-001");
    expect(new Set(trackIds).size).toBe(3);
  });
});
