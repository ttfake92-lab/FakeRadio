import Database from "better-sqlite3";
import type { Track } from "@fakeradio/shared";

export type PlayedTrack = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  source: Track["source"];
  playedAt: string;
};

export type DjMessage = {
  id: string;
  text: string;
  trackId: string | null;
  storyType: "background" | "lyric-theme" | "mood-reading" | null;
  createdAt: string;
};

export type QueueSnapshot = {
  id: string;
  trackIds: string[];
  blockAt: string | null;
  createdAt: string;
};

export type PrefsUpdate = {
  id: string;
  key: string;
  valueJson: string;
  updatedAt: string;
};

export type StateRepository = {
  recordPlayedTrack(track: PlayedTrack): Promise<void>;
  getRecentlyPlayed(limit: number, since?: string): Promise<PlayedTrack[]>;
  appendDjMessage(msg: Omit<DjMessage, "id" | "createdAt">): Promise<DjMessage>;
  getDjMessagesToday(): Promise<DjMessage[]>;
  snapshotQueue(trackIds: string[], blockAt: string | null): Promise<QueueSnapshot>;
  getLatestQueueSnapshot(): Promise<QueueSnapshot | null>;
  upsertPref(key: string, value: unknown): Promise<void>;
  getPref<T>(key: string): Promise<T | null>;
  getStartupState(): Promise<{
    lastPlayedTracks: PlayedTrack[];
    todayDjMessages: DjMessage[];
    lastQueueSnapshot: QueueSnapshot | null;
    latestPrefs: PrefsUpdate[];
  }>;
  pruneOldData(beforeIso: string): Promise<number>;
};

export function createStateRepository(dbPath: string): StateRepository {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS played_tracks (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, title TEXT NOT NULL,
      artist TEXT NOT NULL, album TEXT, source TEXT NOT NULL, played_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dj_messages (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, track_id TEXT,
      story_type TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queue_snapshots (
      id TEXT PRIMARY KEY, track_ids TEXT NOT NULL, block_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prefs_updates (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_played_tracks_played_at ON played_tracks(played_at);
    CREATE INDEX IF NOT EXISTS idx_dj_messages_created_at ON dj_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_queue_snapshots_created_at ON queue_snapshots(created_at);
  `);

  // Prepared statements for inserts
  const stmtInsertTrack = db.prepare(`INSERT INTO played_tracks (id, track_id, title, artist, album, source, played_at) VALUES (@id, @trackId, @title, @artist, @album, @source, @playedAt)`);
  const stmtInsertDj = db.prepare(`INSERT INTO dj_messages (id, text, track_id, story_type, created_at) VALUES (@id, @text, @trackId, @storyType, @createdAt)`);
  const stmtSnapshotQueue = db.prepare(`INSERT INTO queue_snapshots (id, track_ids, block_at, created_at) VALUES (@id, @trackIds, @blockAt, @createdAt)`);
  const stmtUpsertPref = db.prepare(`INSERT INTO prefs_updates (id, key, value_json, updated_at) VALUES (@id, @key, @valueJson, @updatedAt) ON CONFLICT(key) DO UPDATE SET value_json = @valueJson, updated_at = @updatedAt`);

  function mapRowToPlayedTrack(row: unknown): PlayedTrack {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      trackId: r.track_id as string,
      title: r.title as string,
      artist: r.artist as string,
      album: r.album as string | null,
      source: r.source as PlayedTrack["source"],
      playedAt: r.played_at as string
    };
  }

  function mapRowToDjMessage(row: unknown): DjMessage {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      text: r.text as string,
      trackId: r.track_id as string | null,
      storyType: r.story_type as DjMessage["storyType"],
      createdAt: r.created_at as string
    };
  }

  return {
    recordPlayedTrack(track: PlayedTrack): Promise<void> {
      stmtInsertTrack.run({
        id: track.id,
        trackId: track.trackId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        source: track.source,
        playedAt: track.playedAt
      });
      return Promise.resolve();
    },

    getRecentlyPlayed(limit: number, since?: string): Promise<PlayedTrack[]> {
      return Promise.resolve(
        since
          ? (db.prepare(`SELECT * FROM played_tracks WHERE played_at >= ? ORDER BY played_at DESC LIMIT ?`).all(since, limit) as unknown[])
          : (db.prepare(`SELECT * FROM played_tracks ORDER BY played_at DESC LIMIT ?`).all(limit) as unknown[])
      ).then(rows => rows.map(mapRowToPlayedTrack));
    },

    appendDjMessage(msg: Omit<DjMessage, "id" | "createdAt">): Promise<DjMessage> {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      stmtInsertDj.run({ id, text: msg.text, trackId: msg.trackId ?? null, storyType: msg.storyType ?? null, createdAt });
      return Promise.resolve({ id, ...msg, createdAt });
    },

    getDjMessagesToday(): Promise<DjMessage[]> {
      const today = new Date().toISOString().split('T')[0];
      return Promise.resolve(
        db.prepare(`SELECT * FROM dj_messages WHERE created_at >= ? ORDER BY created_at ASC`).all(today) as unknown[]
      ).then(rows => rows.map(mapRowToDjMessage));
    },

    snapshotQueue(trackIds: string[], blockAt: string | null): Promise<QueueSnapshot> {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      stmtSnapshotQueue.run({ id, trackIds: JSON.stringify(trackIds), blockAt, createdAt });
      return Promise.resolve({ id, trackIds, blockAt, createdAt });
    },

    getLatestQueueSnapshot(): Promise<QueueSnapshot | null> {
      const row = db.prepare(`SELECT * FROM queue_snapshots ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
      return Promise.resolve(row
        ? { id: row.id as string, trackIds: JSON.parse(row.track_ids as string), blockAt: row.block_at as string | null, createdAt: row.created_at as string }
        : null
      );
    },

    upsertPref(key: string, value: unknown): Promise<void> {
      stmtUpsertPref.run({
        id: crypto.randomUUID(),
        key,
        valueJson: JSON.stringify(value),
        updatedAt: new Date().toISOString()
      });
      return Promise.resolve();
    },

    getPref<T>(key: string): Promise<T | null> {
      const row = db.prepare(`SELECT value_json FROM prefs_updates WHERE key = ?`).get(key) as { value_json: string } | undefined;
      return Promise.resolve(row ? (JSON.parse(row.value_json) as T) : null);
    },

    getStartupState() {
      const lastPlayedTracks = db.prepare(`SELECT * FROM played_tracks ORDER BY played_at DESC LIMIT 50`).all() as unknown[];
      const today = new Date().toISOString().split('T')[0];
      const todayDjMessages = db.prepare(`SELECT * FROM dj_messages WHERE created_at >= ? ORDER BY created_at ASC`).all(today) as unknown[];
      const lastQueueSnapshotRow = db.prepare(`SELECT * FROM queue_snapshots ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
      const latestPrefs = db.prepare(`SELECT * FROM prefs_updates ORDER BY updated_at DESC`).all() as unknown as PrefsUpdate[];

      return Promise.resolve({
        lastPlayedTracks: lastPlayedTracks.map(mapRowToPlayedTrack),
        todayDjMessages: todayDjMessages.map(mapRowToDjMessage),
        lastQueueSnapshot: lastQueueSnapshotRow
          ? { id: lastQueueSnapshotRow.id as string, trackIds: JSON.parse(lastQueueSnapshotRow.track_ids as string), blockAt: lastQueueSnapshotRow.block_at as string | null, createdAt: lastQueueSnapshotRow.created_at as string }
          : null,
        latestPrefs
      });
    },

    pruneOldData(beforeIso: string): Promise<number> {
      const result = db.prepare(`DELETE FROM played_tracks WHERE played_at < ?`).run(beforeIso);
      return Promise.resolve(result.changes);
    }
  };
}
