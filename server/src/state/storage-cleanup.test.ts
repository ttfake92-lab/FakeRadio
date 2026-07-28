import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateRepository } from "./state-repository.js";
import { runStorageCleanup } from "./storage-cleanup.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const RETENTION_DAYS = 30;

function makeEpisode(trackId: string, ttsFile: string) {
  return {
    track: { id: trackId, title: "Test Track", artist: "Test Artist", durationMs: 180000, source: "local" as const, audioUrl: `http://localhost/audio/${trackId}.mp3` },
    story: { text: "Hello", audioUrl: `/cache/tts/${ttsFile}`, type: "mood-reading" as const },
    sources: [{ kind: "metadata" as const, title: "Mock", content: "Mock source" }],
    playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 }
  };
}

describe("runStorageCleanup", () => {
  let tempDir: string;
  let ttsCacheDir: string;
  let audioDir: string;
  let repo: ReturnType<typeof createStateRepository>;

  function writeAgedFile(dir: string, name: string, ageDays: number) {
    const filePath = join(dir, name);
    writeFileSync(filePath, "audio-bytes");
    const mtime = new Date(NOW.getTime() - ageDays * 24 * 60 * 60 * 1000);
    utimesSync(filePath, mtime, mtime);
    return filePath;
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "storage-cleanup-test-"));
    ttsCacheDir = join(tempDir, "tts");
    audioDir = join(tempDir, "audio");
    mkdirSync(ttsCacheDir);
    mkdirSync(audioDir);
    repo = createStateRepository(join(tempDir, "test.db"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("deletes files older than retention and keeps recent ones", async () => {
    const oldTts = writeAgedFile(ttsCacheDir, "old.wav", 40);
    const freshTts = writeAgedFile(ttsCacheDir, "fresh.wav", 5);
    const oldAudio = writeAgedFile(audioDir, "old-track.mp3", 40);
    const freshAudio = writeAgedFile(audioDir, "fresh-track.mp3", 5);

    const result = await runStorageCleanup({
      stateRepo: repo, ttsCacheDir, audioDir,
      retentionDays: RETENTION_DAYS, nowProvider: () => NOW
    });

    expect(result.ttsFilesDeleted).toBe(1);
    expect(result.audioFilesDeleted).toBe(1);
    expect(existsSync(oldTts)).toBe(false);
    expect(existsSync(freshTts)).toBe(true);
    expect(existsSync(oldAudio)).toBe(false);
    expect(existsSync(freshAudio)).toBe(true);
  });

  it("keeps old files still referenced by ready prepared episodes", async () => {
    const referencedTts = writeAgedFile(ttsCacheDir, "referenced.wav", 40);
    const referencedAudio = writeAgedFile(audioDir, "track-live.mp3", 40);
    const unreferencedTts = writeAgedFile(ttsCacheDir, "orphan.wav", 40);

    await repo.savePreparedEpisode({
      radioDate: "2026-07-11",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(makeEpisode("track-live", "referenced.wav")),
      audioDownloaded: true
    });

    const result = await runStorageCleanup({
      stateRepo: repo, ttsCacheDir, audioDir,
      retentionDays: RETENTION_DAYS, nowProvider: () => NOW
    });

    expect(existsSync(referencedTts)).toBe(true);
    expect(existsSync(referencedAudio)).toBe(true);
    expect(existsSync(unreferencedTts)).toBe(false);
    expect(result.ttsFilesDeleted).toBe(1);
    expect(result.audioFilesDeleted).toBe(0);
  });

  it("does not protect files referenced only by expired prepared episodes", async () => {
    // 旧日期的 prepared episode 先被 DB 清掉，它引用的文件随后按年龄删除
    const staleTts = writeAgedFile(ttsCacheDir, "stale.wav", 40);
    await repo.savePreparedEpisode({
      radioDate: "2026-01-01",
      blockAt: "08:00",
      status: "ready",
      episodeJson: JSON.stringify(makeEpisode("track-stale", "stale.wav")),
      audioDownloaded: true
    });

    const result = await runStorageCleanup({
      stateRepo: repo, ttsCacheDir, audioDir,
      retentionDays: RETENTION_DAYS, nowProvider: () => NOW
    });

    expect(result.dbRowsPruned).toBe(1);
    expect(existsSync(staleTts)).toBe(false);
  });

  it("prunes old db rows and always keeps the latest queue snapshot", async () => {
    const oldIso = "2026-01-01T10:00:00.000Z";
    await repo.recordPlayedTrack({ id: "pt-old", trackId: "t-old", title: "Old", artist: "A", album: null, source: "local", playedAt: oldIso });
    await repo.recordPlayedTrack({ id: "pt-new", trackId: "t-new", title: "New", artist: "A", album: null, source: "local", playedAt: NOW.toISOString() });
    // 两条都过期的快照：最新一条也要保留（长期停机后重启仍能恢复队列）
    await repo.snapshotQueue([], "08:00");
    await repo.snapshotQueue([], "09:00");
    const db = (await import("better-sqlite3")).default(join(tempDir, "test.db"));
    db.prepare(`UPDATE queue_snapshots SET created_at = ?`).run(oldIso);
    db.close();

    const result = await runStorageCleanup({
      stateRepo: repo, ttsCacheDir, audioDir,
      retentionDays: RETENTION_DAYS, nowProvider: () => NOW
    });

    expect(result.dbRowsPruned).toBe(2); // 1 played_track + 1 queue_snapshot
    const remaining = await repo.getRecentlyPlayed(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.trackId).toBe("t-new");
    expect(await repo.getLatestQueueSnapshot()).not.toBeNull();
  });

  it("returns zeros when cache directories do not exist", async () => {
    const result = await runStorageCleanup({
      stateRepo: repo,
      ttsCacheDir: join(tempDir, "missing-tts"),
      audioDir: join(tempDir, "missing-audio"),
      retentionDays: RETENTION_DAYS,
      nowProvider: () => NOW
    });

    expect(result).toEqual({ dbRowsPruned: 0, ttsFilesDeleted: 0, audioFilesDeleted: 0 });
  });
});
