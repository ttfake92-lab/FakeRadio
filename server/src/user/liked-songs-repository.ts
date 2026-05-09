import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Track } from "@fakeradio/shared";

export type LikedSongsDiagnostics = {
  loaded: boolean;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  samples: Array<{ id: string; title: string; artist: string; album: string }>;
};

export type LikedSongsRepository = {
  getDiagnostics(): Promise<LikedSongsDiagnostics>;
  list(): Promise<Track[]>;
};

interface RawNeteaseSong {
  id: number;
  name: string;
  ar?: Array<{ name: string }>;
  al?: { name: string; picUrl?: string };
}

function isValidRawSong(item: unknown): item is RawNeteaseSong {
  if (typeof item !== "object" || item === null) return false;
  const s = item as RawNeteaseSong;
  const firstArtist = s.ar?.[0];
  return (
    typeof s.id === "number" &&
    typeof s.name === "string" &&
    s.name.length > 0 &&
    Array.isArray(s.ar) &&
    s.ar.length > 0 &&
    typeof firstArtist?.name === "string" &&
    typeof s.al === "object" &&
    s.al !== null &&
    typeof s.al.name === "string"
  );
}

function normalizeRawSong(song: RawNeteaseSong): Track {
  return {
    id: String(song.id),
    title: song.name,
    artist: song.ar?.[0]?.name ?? "Unknown Artist",
    album: song.al?.name ?? "Unknown Album",
    artworkUrl: song.al?.picUrl,
    source: "netease"
  };
}

export function createLikedSongsRepository(baseDir: string): LikedSongsRepository {
  const filePath = resolve(baseDir, "user/netease-liked-songs.raw.json");

  async function loadAndNormalize(): Promise<{ tracks: Track[]; totalCount: number; validCount: number; invalidCount: number; loaded: boolean }> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;

      if (!Array.isArray(parsed)) {
        return { tracks: [], totalCount: 0, validCount: 0, invalidCount: 0, loaded: false };
      }

      const tracks: Track[] = [];
      let validCount = 0;
      let invalidCount = 0;
      for (const item of parsed) {
        if (isValidRawSong(item)) {
          tracks.push(normalizeRawSong(item));
          validCount++;
        } else {
          invalidCount++;
        }
      }
      return { tracks, totalCount: parsed.length, validCount, invalidCount, loaded: true };
    } catch {
      return { tracks: [], totalCount: 0, validCount: 0, invalidCount: 0, loaded: false };
    }
  }

  return {
    async getDiagnostics() {
      const { tracks, loaded, totalCount, validCount, invalidCount } = await loadAndNormalize();
      const samples = tracks.slice(0, 3).map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album ?? "Unknown Album"
      }));

      return {
        loaded,
        totalCount,
        validCount,
        invalidCount,
        samples
      };
    },

    async list() {
      const { tracks } = await loadAndNormalize();
      return tracks;
    }
  };
}
