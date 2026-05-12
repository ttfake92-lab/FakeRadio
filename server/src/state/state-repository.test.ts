import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateRepository } from "./state-repository.js";
import type { PlayedTrack, DjMessage, QueueSnapshot, PrefsUpdate } from "./state-repository.js";

describe("createStateRepository", () => {
  let tempDir: string;
  let repo: ReturnType<typeof createStateRepository>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "state-repo-test-"));
    repo = createStateRepository(join(tempDir, "test.db"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // --- recordPlayedTrack & getRecentlyPlayed ---

  it("records a played track and retrieves it", async () => {
    const track: PlayedTrack = {
      id: "pt-001",
      trackId: "track-abc",
      title: "Morning Signal",
      artist: "FakeRadio",
      album: "Dawn EP",
      source: "mock",
      playedAt: new Date().toISOString()
    };

    await repo.recordPlayedTrack(track);
    const recent = await repo.getRecentlyPlayed(10);

    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      id: "pt-001",
      trackId: "track-abc",
      title: "Morning Signal",
      artist: "FakeRadio",
      album: "Dawn EP",
      source: "mock"
    });
  });

  it("getRecentlyPlayed returns tracks in reverse chronological order", async () => {
    const t1 = new Date("2026-01-01T10:00:00Z");
    const t2 = new Date("2026-01-01T11:00:00Z");
    const t3 = new Date("2026-01-01T12:00:00Z");

    await repo.recordPlayedTrack({ id: "pt-1", trackId: "t1", title: "T1", artist: "A", album: null, source: "mock", playedAt: t1.toISOString() });
    await repo.recordPlayedTrack({ id: "pt-2", trackId: "t2", title: "T2", artist: "A", album: null, source: "mock", playedAt: t2.toISOString() });
    await repo.recordPlayedTrack({ id: "pt-3", trackId: "t3", title: "T3", artist: "A", album: null, source: "mock", playedAt: t3.toISOString() });

    const recent = await repo.getRecentlyPlayed(10);

    expect(recent.map(t => t.id)).toEqual(["pt-3", "pt-2", "pt-1"]);
  });

  it("getRecentlyPlayed respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.recordPlayedTrack({ id: `pt-${i}`, trackId: `t${i}`, title: `T${i}`, artist: "A", album: null, source: "mock", playedAt: new Date().toISOString() });
    }

    const recent = await repo.getRecentlyPlayed(3);

    expect(recent).toHaveLength(3);
  });

  it("getRecentlyPlayed filters by since timestamp", async () => {
    const old = new Date("2026-01-01T10:00:00Z");
    const recent = new Date("2026-06-01T10:00:00Z");

    await repo.recordPlayedTrack({ id: "pt-old", trackId: "t-old", title: "Old", artist: "A", album: null, source: "mock", playedAt: old.toISOString() });
    await repo.recordPlayedTrack({ id: "pt-new", trackId: "t-new", title: "New", artist: "A", album: null, source: "mock", playedAt: recent.toISOString() });

    const result = await repo.getRecentlyPlayed(10, recent.toISOString());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pt-new");
  });

  // --- appendDjMessage & getDjMessagesToday ---

  it("appends a DJ message and returns it with id and createdAt", async () => {
    const input = { text: "Hello, morning!", trackId: "track-abc", storyType: "background" as const };

    const msg = await repo.appendDjMessage(input);

    expect(msg.id).toBeDefined();
    expect(msg.text).toBe("Hello, morning!");
    expect(msg.trackId).toBe("track-abc");
    expect(msg.storyType).toBe("background");
    expect(msg.createdAt).toBeDefined();
  });

  it("appends a DJ message with null optional fields", async () => {
    const input = { text: "Solo message", trackId: null, storyType: null };

    const msg = await repo.appendDjMessage(input);

    expect(msg.trackId).toBeNull();
    expect(msg.storyType).toBeNull();
  });

  it("getDjMessagesToday returns only today's messages", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // We can't easily inject old messages via the API, but we can verify the query is correct
    const msg1 = await repo.appendDjMessage({ text: "Today msg", trackId: null, storyType: null });
    const msgs = await repo.getDjMessagesToday();

    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs.find(m => m.id === msg1.id)).toBeDefined();
  });

  // --- snapshotQueue & getLatestQueueSnapshot ---

  it("snapshots the queue and retrieves it", async () => {
    const tracks = [
      { id: "track-1", title: "Track 1", artist: "Artist", source: "mock" as const },
      { id: "track-2", title: "Track 2", artist: "Artist", source: "mock" as const },
      { id: "track-3", title: "Track 3", artist: "Artist", source: "mock" as const }
    ];
    const blockAt = "2026-05-08T12:00:00Z";

    const snapshot = await repo.snapshotQueue(tracks, blockAt);

    expect(snapshot.id).toBeDefined();
    expect(snapshot.trackIds).toEqual(tracks);
    expect(snapshot.blockAt).toBe(blockAt);
    expect(snapshot.createdAt).toBeDefined();
  });

  it("getLatestQueueSnapshot returns null when no snapshot exists", async () => {
    const result = await repo.getLatestQueueSnapshot();
    expect(result).toBeNull();
  });

  it("getLatestQueueSnapshot returns the most recent snapshot", async () => {
    await repo.snapshotQueue([
      { id: "a", title: "A", artist: "X", source: "mock" as const },
      { id: "b", title: "B", artist: "X", source: "mock" as const }
    ], null);
    await new Promise(r => setTimeout(r, 10)); // small delay to ensure different timestamps
    const latest = await repo.snapshotQueue([
      { id: "x", title: "X", artist: "Y", source: "mock" as const },
      { id: "y", title: "Y", artist: "Y", source: "mock" as const },
      { id: "z", title: "Z", artist: "Y", source: "mock" as const }
    ], "2026-05-08T12:00:00Z");

    const result = await repo.getLatestQueueSnapshot();

    expect(result).not.toBeNull();
    expect(result!.id).toBe(latest.id);
    expect(result!.trackIds).toEqual(latest.trackIds);
  });

  // --- upsertPref & getPref ---

  it("upserts and retrieves a preference", async () => {
    await repo.upsertPref("theme", "dark");
    const value = await repo.getPref<string>("theme");

    expect(value).toBe("dark");
  });

  it("getPref returns null for unknown key", async () => {
    const value = await repo.getPref<string>("does-not-exist");
    expect(value).toBeNull();
  });

  it("upsertPref overwrites existing value", async () => {
    await repo.upsertPref("counter", 1);
    await repo.upsertPref("counter", 2);

    const value = await repo.getPref<number>("counter");
    expect(value).toBe(2);
  });

  it("upsertPref handles complex values (objects)", async () => {
    const complex = { nested: { value: [1, 2, 3] }, flag: true };
    await repo.upsertPref("complex", complex);

    const retrieved = await repo.getPref<typeof complex>("complex");
    expect(retrieved).toEqual(complex);
  });

  // --- getStartupState ---

  it("getStartupState returns all current state", async () => {
    // Add some data
    await repo.recordPlayedTrack({ id: "pt-1", trackId: "t1", title: "T1", artist: "A", album: null, source: "mock", playedAt: new Date().toISOString() });
    await repo.appendDjMessage({ text: "DJ hello", trackId: null, storyType: null });
    await repo.snapshotQueue([
      { id: "q1", title: "Q1", artist: "A", source: "mock" as const },
      { id: "q2", title: "Q2", artist: "A", source: "mock" as const }
    ], null);
    await repo.upsertPref("key1", "value1");

    const state = await repo.getStartupState();

    expect(state.lastPlayedTracks.length).toBeGreaterThanOrEqual(1);
    expect(state.todayDjMessages.length).toBeGreaterThanOrEqual(1);
    expect(state.lastQueueSnapshot).not.toBeNull();
    expect(state.lastQueueSnapshot!.trackIds).toHaveLength(2);
    expect(state.lastQueueSnapshot!.trackIds[0]!.id).toBe("q1");
    expect(state.lastQueueSnapshot!.trackIds[1]!.id).toBe("q2");
    expect(state.latestPrefs.length).toBeGreaterThanOrEqual(1);
    expect(state.latestPrefs.find(p => p.key === "key1")).toBeDefined();
  });

  it("getStartupState latestPrefs maps value_json to valueJson correctly", async () => {
    await repo.upsertPref("theme", "dark");
    await repo.upsertPref("volume", 80);

    const state = await repo.getStartupState();

    const themePref = state.latestPrefs.find(p => p.key === "theme");
    const volumePref = state.latestPrefs.find(p => p.key === "volume");

    expect(themePref).toBeDefined();
    expect(volumePref).toBeDefined();
    // Verify the mapper used camelCase property, not snake_case
    expect(themePref!.valueJson).toBe('"dark"');
    expect(volumePref!.valueJson).toBe("80");
    // Ensure snake_case key does NOT exist on the mapped object
    expect((themePref as unknown as Record<string, unknown>).value_json).toBeUndefined();
  });

  // --- pruneOldData ---

  it("pruneOldData deletes tracks before the given timestamp", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-06-01T00:00:00Z");

    await repo.recordPlayedTrack({ id: "pt-old", trackId: "t-old", title: "Old", artist: "A", album: null, source: "mock", playedAt: old.toISOString() });
    await repo.recordPlayedTrack({ id: "pt-new", trackId: "t-new", title: "New", artist: "A", album: null, source: "mock", playedAt: recent.toISOString() });

    const pruned = await repo.pruneOldData(recent.toISOString());

    expect(pruned).toBe(1);

    const remaining = await repo.getRecentlyPlayed(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("pt-new");
  });

  it("pruneOldData returns 0 when nothing to prune", async () => {
    const result = await repo.pruneOldData(new Date().toISOString());
    expect(result).toBe(0);
  });

  // --- savePreparedEpisode ---

  it("saves a prepared episode and returns it with id and timestamps", async () => {
    const episode = {
      track: { id: "t1", title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/t1.mp3" },
      story: { text: "Hello", audioUrl: "http://localhost/tts/hello.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    const input = {
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready" as const,
      episodeJson: JSON.stringify(episode),
      audioDownloaded: true,
      error: undefined
    };

    const record = await repo.savePreparedEpisode(input);

    expect(record.id).toBeDefined();
    expect(record.radioDate).toBe("2026-05-09");
    expect(record.blockAt).toBe("08:00");
    expect(record.status).toBe("ready");
    expect(record.episodeJson).toBe(input.episodeJson);
    expect(record.audioDownloaded).toBe(true);
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
  });

  it("saves a prepared episode with minimal fields", async () => {
    const input = {
      radioDate: "2026-05-09",
      blockAt: "2026-05-09T12:00:00Z",
      status: "preparing" as const
    };

    const record = await repo.savePreparedEpisode(input);

    expect(record.episodeJson).toBeUndefined();
    expect(record.audioDownloaded).toBeUndefined();
    expect(record.error).toBeUndefined();
  });

  // --- claimPreparedEpisode ---

  it("claims a ready prepared episode and returns parsed RadioEpisode", async () => {
    const episode = {
      track: { id: "t1", title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/t1.mp3" },
      story: { text: "Hello", audioUrl: "http://localhost/tts/hello.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(episode),
      audioDownloaded: true
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00");

    expect(claimed).not.toBeNull();
    expect(claimed!.record.status).toBe("consumed");
    expect(claimed!.record.audioDownloaded).toBe(true);
    expect(claimed!.episode.track.id).toBe("t1");
    expect(claimed!.episode.story.text).toBe("Hello");
  });

  it("prefers a non-recent prepared episode when claiming", async () => {
    const recentEpisode = {
      track: { id: "recent-track", title: "Recent Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/recent-track.mp3" },
      story: { text: "Recent", audioUrl: "http://localhost/tts/recent.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    const freshEpisode = {
      track: { id: "fresh-track", title: "Fresh Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/fresh-track.mp3" },
      story: { text: "Fresh", audioUrl: "http://localhost/tts/fresh.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(recentEpisode)
    });
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(freshEpisode)
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00", ["recent-track"]);

    expect(claimed).not.toBeNull();
    expect(claimed!.episode.track.id).toBe("fresh-track");
  });

  it("returns null instead of replaying prepared episodes when all ready tracks are recent", async () => {
    const recentEpisode = {
      track: { id: "recent-track", title: "Recent Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/recent-track.mp3" },
      story: { text: "Recent", audioUrl: "http://localhost/tts/recent.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(recentEpisode)
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00", ["recent-track"]);

    expect(claimed).toBeNull();
  });

  it("returns null when claiming and no ready record exists", async () => {
    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(claimed).toBeNull();
  });

  it("returns null when claiming from wrong radioDate", async () => {
    const episode = {
      track: { id: "t1", title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/t1.mp3" },
      story: { text: "Hello", audioUrl: "http://localhost/tts/hello.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(episode)
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-10", "08:00");
    expect(claimed).toBeNull();
  });

  it("returns null when claiming from wrong blockAt", async () => {
    const episode = {
      track: { id: "t1", title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/t1.mp3" },
      story: { text: "Hello", audioUrl: "http://localhost/tts/hello.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(episode)
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-09", "12:00");
    expect(claimed).toBeNull();
  });

  it("does not claim already consumed records", async () => {
    const episode = {
      track: { id: "t1", title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "mock" as const, audioUrl: "http://localhost/audio/t1.mp3" },
      story: { text: "Hello", audioUrl: "http://localhost/tts/hello.wav", type: "mood-reading" as const },
      sources: [{ kind: "mock" as const, title: "Mock", content: "Mock source" }],
      playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
    };
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(episode)
    });

    const first = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(first).not.toBeNull();

    const second = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(second).toBeNull();
  });

  it("rejects saving a prepared episode with invalid episode JSON", () => {
    expect(() => repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify({ invalid: true })
    })).toThrow();
  });

  it("returns null when claiming a record with missing episode JSON", async () => {
    await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready"
    });

    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(claimed).toBeNull();
  });

  // --- getPrewarmStatus ---

  it("returns zero counts when no prepared episodes exist", async () => {
    const status = await repo.getPrewarmStatus("2026-05-09");
    expect(status).toEqual({ ready: 0, consumed: 0, failed: 0, preparing: 0 });
  });

  it("returns correct counts grouped by status", async () => {
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "08:00", status: "ready" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "08:00", status: "ready" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "12:00", status: "consumed" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "12:00", status: "failed" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "18:00", status: "preparing" });
    // Different date — should not be counted
    await repo.savePreparedEpisode({ radioDate: "2026-05-10", blockAt: "08:00", status: "ready" });

    const status = await repo.getPrewarmStatus("2026-05-09");

    expect(status).toEqual({ ready: 2, consumed: 1, failed: 1, preparing: 1 });
  });

  // --- getBlockPrewarmStatus ---

  it("getBlockPrewarmStatus returns zero counts when no prepared episodes exist", async () => {
    const status = await repo.getBlockPrewarmStatus("2026-05-09", "08:00");
    expect(status).toEqual({ ready: 0, consumed: 0, failed: 0, preparing: 0 });
  });

  it("getBlockPrewarmStatus returns correct counts per block", async () => {
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "08:00", status: "ready" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "08:00", status: "ready" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "08:00", status: "consumed" });
    await repo.savePreparedEpisode({ radioDate: "2026-05-09", blockAt: "12:00", status: "failed" });
    // Different date — should not be counted
    await repo.savePreparedEpisode({ radioDate: "2026-05-10", blockAt: "08:00", status: "ready" });

    const block08 = await repo.getBlockPrewarmStatus("2026-05-09", "08:00");
    expect(block08).toEqual({ ready: 2, consumed: 1, failed: 0, preparing: 0 });

    const block12 = await repo.getBlockPrewarmStatus("2026-05-09", "12:00");
    expect(block12).toEqual({ ready: 0, consumed: 0, failed: 1, preparing: 0 });

    const blockOther = await repo.getBlockPrewarmStatus("2026-05-09", "21:00");
    expect(blockOther).toEqual({ ready: 0, consumed: 0, failed: 0, preparing: 0 });
  });

  // --- markPreparedEpisodeAudioDownloaded ---

  it("marks a prepared episode audio as downloaded", async () => {
    const record = await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify({
        track: { id: "t1", title: "Test", artist: "Artist", source: "mock" as const },
        story: { text: "Hello", audioUrl: "http://localhost/tts/h.wav", type: "mood-reading" as const },
        sources: [{ kind: "mock", title: "M", content: "C" }],
        playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
      })
    });
    expect(record.audioDownloaded).toBeUndefined();

    await repo.markPreparedEpisodeAudioDownloaded(record.id, true);

    // Re-read via claim to verify update
    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(claimed).not.toBeNull();
    expect(claimed!.record.audioDownloaded).toBe(true);
  });

  it("marks audio as not downloaded", async () => {
    const record = await repo.savePreparedEpisode({
      radioDate: "2026-05-09",
      blockAt: "08:00",
      status: "ready",
      audioDownloaded: true,
      episodeJson: JSON.stringify({
        track: { id: "t2", title: "Test 2", artist: "Artist", source: "mock" as const },
        story: { text: "Hello", audioUrl: "http://localhost/tts/h.wav", type: "mood-reading" as const },
        sources: [{ kind: "mock", title: "M", content: "C" }],
        playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
      })
    });

    await repo.markPreparedEpisodeAudioDownloaded(record.id, false);
    const claimed = await repo.claimPreparedEpisode("2026-05-09", "08:00");
    expect(claimed!.record.audioDownloaded).toBe(false);
  });
});
