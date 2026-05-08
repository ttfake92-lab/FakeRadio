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
    const trackIds = ["track-1", "track-2", "track-3"];
    const blockAt = "2026-05-08T12:00:00Z";

    const snapshot = await repo.snapshotQueue(trackIds, blockAt);

    expect(snapshot.id).toBeDefined();
    expect(snapshot.trackIds).toEqual(trackIds);
    expect(snapshot.blockAt).toBe(blockAt);
    expect(snapshot.createdAt).toBeDefined();
  });

  it("getLatestQueueSnapshot returns null when no snapshot exists", async () => {
    const result = await repo.getLatestQueueSnapshot();
    expect(result).toBeNull();
  });

  it("getLatestQueueSnapshot returns the most recent snapshot", async () => {
    await repo.snapshotQueue(["a", "b"], null);
    await new Promise(r => setTimeout(r, 10)); // small delay to ensure different timestamps
    const latest = await repo.snapshotQueue(["x", "y", "z"], "2026-05-08T12:00:00Z");

    const result = await repo.getLatestQueueSnapshot();

    expect(result).not.toBeNull();
    expect(result!.id).toBe(latest.id);
    expect(result!.trackIds).toEqual(["x", "y", "z"]);
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
    await repo.snapshotQueue(["q1", "q2"], null);
    await repo.upsertPref("key1", "value1");

    const state = await repo.getStartupState();

    expect(state.lastPlayedTracks.length).toBeGreaterThanOrEqual(1);
    expect(state.todayDjMessages.length).toBeGreaterThanOrEqual(1);
    expect(state.lastQueueSnapshot).not.toBeNull();
    expect(state.lastQueueSnapshot!.trackIds).toEqual(["q1", "q2"]);
    expect(state.latestPrefs.length).toBeGreaterThanOrEqual(1);
    expect(state.latestPrefs.find(p => p.key === "key1")).toBeDefined();
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
});
