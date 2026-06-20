import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FavoriteTrack } from "@fakeradio/shared";
import { createWriteLock } from "../utils/shared-utils.js";

export type FavoritesRepository = {
  list(): Promise<FavoriteTrack[]>;
  has(trackId: string): Promise<boolean>;
  save(track: Omit<FavoriteTrack, "favoritedAt">): Promise<FavoriteTrack>;
  remove(trackId: string): Promise<boolean>;
};

export function createFavoritesRepository(filePath: string): FavoritesRepository {
  const withWriteLock = createWriteLock();

  async function readAll(): Promise<FavoriteTrack[]> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as FavoriteTrack[];
    } catch {
      return [];
    }
  }

  async function writeAll(favorites: FavoriteTrack[]): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(favorites, null, 2), "utf-8");
  }


  return {
    async list() {
      return readAll();
    },

    async has(trackId) {
      const favorites = await readAll();
      return favorites.some((f) => f.trackId === trackId);
    },

    async save(track) {
      return withWriteLock(async () => {
        const favorites = await readAll();
        if (favorites.some((f) => f.trackId === track.trackId)) {
          return favorites.find((f) => f.trackId === track.trackId)!;
        }
        const entry: FavoriteTrack = {
          ...track,
          favoritedAt: new Date().toISOString()
        };
        favorites.push(entry);
        await writeAll(favorites);
        return entry;
      });
    },

    async remove(trackId) {
      return withWriteLock(async () => {
        const favorites = await readAll();
        const index = favorites.findIndex((f) => f.trackId === trackId);
        if (index === -1) return false;
        favorites.splice(index, 1);
        await writeAll(favorites);
        return true;
      });
    }
  };
}
