import Database from "better-sqlite3";
import type { Track, PreparedEpisodeRecord, RadioEpisode } from "@fakeradio/shared";
import { formatRadioDate } from "../utils/time.js";
import { TrackSchema, RadioEpisodeSchema } from "@fakeradio/shared";

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
  trackIds: Track[];
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
  snapshotQueue(tracks: Track[], blockAt: string | null): Promise<QueueSnapshot>;
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
  savePreparedEpisode(record: Omit<PreparedEpisodeRecord, "id" | "createdAt" | "updatedAt">): Promise<PreparedEpisodeRecord>;
  claimPreparedEpisode(radioDate: string, blockAt: string): Promise<{ record: PreparedEpisodeRecord; episode: RadioEpisode } | null>;
  getPrewarmStatus(radioDate: string): Promise<{ ready: number; consumed: number; failed: number; preparing: number }>;
  getBlockPrewarmStatus(radioDate: string, blockAt: string): Promise<{ ready: number; consumed: number; failed: number; preparing: number }>;
  markPreparedEpisodeAudioDownloaded(id: string, downloaded: boolean): Promise<void>;
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
      story_type TEXT, created_at TEXT NOT NULL, radio_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queue_snapshots (
      id TEXT PRIMARY KEY, track_ids TEXT NOT NULL, block_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prefs_updates (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prepared_episodes (
      id TEXT PRIMARY KEY,
      radio_date TEXT NOT NULL,
      block_at TEXT NOT NULL,
      status TEXT NOT NULL,
      episode_json TEXT,
      audio_downloaded INTEGER DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_played_tracks_played_at ON played_tracks(played_at);
    CREATE INDEX IF NOT EXISTS idx_dj_messages_created_at ON dj_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_dj_messages_radio_date ON dj_messages(radio_date);
    CREATE INDEX IF NOT EXISTS idx_queue_snapshots_created_at ON queue_snapshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_prepared_episodes_radio_date_block ON prepared_episodes(radio_date, block_at);
    CREATE INDEX IF NOT EXISTS idx_prepared_episodes_status ON prepared_episodes(status);
  `);

  // Prepared statements for inserts
  const stmtInsertTrack = db.prepare(`INSERT INTO played_tracks (id, track_id, title, artist, album, source, played_at) VALUES (@id, @trackId, @title, @artist, @album, @source, @playedAt)`);
  const stmtInsertDj = db.prepare(`INSERT INTO dj_messages (id, text, track_id, story_type, created_at, radio_date) VALUES (@id, @text, @trackId, @storyType, @createdAt, @radioDate)`);
  const stmtSnapshotQueue = db.prepare(`INSERT INTO queue_snapshots (id, track_ids, block_at, created_at) VALUES (@id, @trackIds, @blockAt, @createdAt)`);
  const stmtUpsertPref = db.prepare(`INSERT INTO prefs_updates (id, key, value_json, updated_at) VALUES (@id, @key, @valueJson, @updatedAt) ON CONFLICT(key) DO UPDATE SET value_json = @valueJson, updated_at = @updatedAt`);
  const stmtInsertPrepared = db.prepare(`INSERT INTO prepared_episodes (id, radio_date, block_at, status, episode_json, audio_downloaded, error, created_at, updated_at) VALUES (@id, @radioDate, @blockAt, @status, @episodeJson, @audioDownloaded, @error, @createdAt, @updatedAt)`);

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

  function mapRowToPrefsUpdate(row: unknown): PrefsUpdate {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      key: r.key as string,
      valueJson: r.value_json as string,
      updatedAt: r.updated_at as string
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
      const safeLimit = Math.floor(Number(limit));
      return Promise.resolve(
        since
          ? (db.prepare(`SELECT * FROM played_tracks WHERE played_at >= ? ORDER BY played_at DESC LIMIT ?`).all(since, safeLimit) as unknown[])
          : (db.prepare(`SELECT * FROM played_tracks ORDER BY played_at DESC LIMIT ?`).all(safeLimit) as unknown[])
      ).then(rows => rows.map(mapRowToPlayedTrack));
    },

    appendDjMessage(msg: Omit<DjMessage, "id" | "createdAt">): Promise<DjMessage> {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const radioDate = formatRadioDate(new Date());
      stmtInsertDj.run({ id, text: msg.text, trackId: msg.trackId ?? null, storyType: msg.storyType ?? null, createdAt, radioDate });
      return Promise.resolve({ id, ...msg, createdAt });
    },

    getDjMessagesToday(): Promise<DjMessage[]> {
      const today = formatRadioDate(new Date());
      return Promise.resolve(
        db.prepare(`SELECT * FROM dj_messages WHERE radio_date = ? ORDER BY created_at ASC`).all(today) as unknown[]
      ).then(rows => rows.map(mapRowToDjMessage));
    },

    snapshotQueue(tracks: Track[], blockAt: string | null): Promise<QueueSnapshot> {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      stmtSnapshotQueue.run({ id, trackIds: JSON.stringify(tracks), blockAt, createdAt });
      return Promise.resolve({ id, trackIds: tracks, blockAt, createdAt });
    },

    getLatestQueueSnapshot(): Promise<QueueSnapshot | null> {
      const row = db.prepare(`SELECT * FROM queue_snapshots ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
      if (!row) return Promise.resolve(null);
      const parsed = JSON.parse(row.track_ids as string);
      const trackIds = Array.isArray(parsed)
        ? parsed.reduce<Track[]>((acc, t) => {
            const result = TrackSchema.safeParse(t);
            return result.success ? [...acc, result.data] : acc;
          }, [])
        : [];
      return Promise.resolve({ id: row.id as string, trackIds, blockAt: row.block_at as string | null, createdAt: row.created_at as string });
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
      const today = formatRadioDate(new Date());
      const todayDjMessages = db.prepare(`SELECT * FROM dj_messages WHERE radio_date = ? ORDER BY created_at ASC`).all(today) as unknown[];
      const lastQueueSnapshotRow = db.prepare(`SELECT * FROM queue_snapshots ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
      const latestPrefsRows = db.prepare(`SELECT * FROM prefs_updates ORDER BY updated_at DESC LIMIT 100`).all() as unknown[];

      let lastQueueSnapshot: QueueSnapshot | null = null;
      if (lastQueueSnapshotRow) {
        const parsed = JSON.parse(lastQueueSnapshotRow.track_ids as string);
        const trackIds = Array.isArray(parsed)
          ? parsed.reduce<Track[]>((acc, t) => {
              const result = TrackSchema.safeParse(t);
              return result.success ? [...acc, result.data] : acc;
            }, [])
          : [];
        lastQueueSnapshot = { id: lastQueueSnapshotRow.id as string, trackIds, blockAt: lastQueueSnapshotRow.block_at as string | null, createdAt: lastQueueSnapshotRow.created_at as string };
      }

      return Promise.resolve({
        lastPlayedTracks: lastPlayedTracks.map(mapRowToPlayedTrack),
        todayDjMessages: todayDjMessages.map(mapRowToDjMessage),
        lastQueueSnapshot,
        latestPrefs: latestPrefsRows.map(mapRowToPrefsUpdate)
      });
    },

    pruneOldData(beforeIso: string): Promise<number> {
      const result = db.prepare(`DELETE FROM played_tracks WHERE played_at < ?`).run(beforeIso);
      return Promise.resolve(result.changes);
    },

    savePreparedEpisode(record: Omit<PreparedEpisodeRecord, "id" | "createdAt" | "updatedAt">): Promise<PreparedEpisodeRecord> {
      if (record.episodeJson) {
        const parsed = JSON.parse(record.episodeJson);
        RadioEpisodeSchema.parse(parsed);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      stmtInsertPrepared.run({
        id,
        radioDate: record.radioDate,
        blockAt: record.blockAt,
        status: record.status,
        episodeJson: record.episodeJson ?? null,
        audioDownloaded: record.audioDownloaded ? 1 : 0,
        error: record.error ?? null,
        createdAt: now,
        updatedAt: now
      });
      return Promise.resolve({ id, ...record, createdAt: now, updatedAt: now });
    },

    claimPreparedEpisode(radioDate: string, blockAt: string): Promise<{ record: PreparedEpisodeRecord; episode: RadioEpisode } | null> {
      const transaction = db.transaction((rDate: string, bAt: string) => {
        const row = db.prepare(
          `SELECT * FROM prepared_episodes WHERE radio_date = ? AND block_at = ? AND status = 'ready' ORDER BY created_at ASC LIMIT 1`
        ).get(rDate, bAt) as Record<string, unknown> | undefined;
        if (!row) return null;
        const updatedAt = new Date().toISOString();
        db.prepare(`UPDATE prepared_episodes SET status = 'consumed', updated_at = ? WHERE id = ?`).run(updatedAt, row.id);
        return { row, updatedAt };
      });

      const result = transaction(radioDate, blockAt);
      if (!result) return Promise.resolve(null);

      const { row, updatedAt } = result;
      const episodeJson = row.episode_json as string | null;
      if (!episodeJson) return Promise.resolve(null);

      const parsed = JSON.parse(episodeJson);
      const validation = RadioEpisodeSchema.safeParse(parsed);
      if (!validation.success) return Promise.resolve(null);

      const record: PreparedEpisodeRecord = {
        id: row.id as string,
        radioDate: row.radio_date as string,
        blockAt: row.block_at as string,
        status: "consumed",
        episodeJson,
        audioDownloaded: Boolean(row.audio_downloaded),
        error: (row.error as string | null) ?? undefined,
        createdAt: row.created_at as string,
        updatedAt
      };

      return Promise.resolve({ record, episode: validation.data });
    },

    getPrewarmStatus(radioDate: string): Promise<{ ready: number; consumed: number; failed: number; preparing: number }> {
      const result = db.prepare(
        `SELECT status, COUNT(*) as count FROM prepared_episodes WHERE radio_date = ? GROUP BY status`
      ).all(radioDate) as Array<{ status: string; count: number }>;
      const status = { ready: 0, consumed: 0, failed: 0, preparing: 0 };
      for (const row of result) {
        if (row.status === "ready") status.ready = row.count;
        if (row.status === "consumed") status.consumed = row.count;
        if (row.status === "failed") status.failed = row.count;
        if (row.status === "preparing") status.preparing = row.count;
      }
      return Promise.resolve(status);
    },

    getBlockPrewarmStatus(radioDate: string, blockAt: string): Promise<{ ready: number; consumed: number; failed: number; preparing: number }> {
      const result = db.prepare(
        `SELECT status, COUNT(*) as count FROM prepared_episodes WHERE radio_date = ? AND block_at = ? GROUP BY status`
      ).all(radioDate, blockAt) as Array<{ status: string; count: number }>;
      const status = { ready: 0, consumed: 0, failed: 0, preparing: 0 };
      for (const row of result) {
        if (row.status === "ready") status.ready = row.count;
        if (row.status === "consumed") status.consumed = row.count;
        if (row.status === "failed") status.failed = row.count;
        if (row.status === "preparing") status.preparing = row.count;
      }
      return Promise.resolve(status);
    },

    markPreparedEpisodeAudioDownloaded(id: string, downloaded: boolean): Promise<void> {
      const updatedAt = new Date().toISOString();
      db.prepare(`UPDATE prepared_episodes SET audio_downloaded = ?, updated_at = ? WHERE id = ?`).run(downloaded ? 1 : 0, updatedAt, id);
      return Promise.resolve();
    }
  };
}
