import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFavoritesRepository } from "./favorites-repository.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "favorites-test-"));
}

describe("createFavoritesRepository", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list when no favorites exist", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    expect(await repo.list()).toEqual([]);
  });

  it("saves and retrieves a favorite", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    const entry = await repo.save({ trackId: "t1", title: "Song A", artist: "Artist A" });

    expect(entry.trackId).toBe("t1");
    expect(entry.favoritedAt).toBeTruthy();

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].trackId).toBe("t1");
  });

  it("does not duplicate favorites with the same trackId", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    await repo.save({ trackId: "t1", title: "Song A", artist: "Artist A" });
    const second = await repo.save({ trackId: "t1", title: "Song A Updated", artist: "Artist A" });

    expect(second.title).toBe("Song A");
    expect(await repo.list()).toHaveLength(1);
  });

  it("has returns true for saved track", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    await repo.save({ trackId: "t1", title: "Song A", artist: "Artist A" });

    expect(await repo.has("t1")).toBe(true);
    expect(await repo.has("t2")).toBe(false);
  });

  it("removes a favorite by trackId", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    await repo.save({ trackId: "t1", title: "Song A", artist: "Artist A" });
    await repo.save({ trackId: "t2", title: "Song B", artist: "Artist B" });

    const removed = await repo.remove("t1");
    expect(removed).toBe(true);
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.has("t1")).toBe(false);
  });

  it("returns false when removing non-existent track", async () => {
    const repo = createFavoritesRepository(join(dir, "favorites.json"));
    expect(await repo.remove("nope")).toBe(false);
  });

  it("persists data across repository instances", async () => {
    const filePath = join(dir, "favorites.json");
    const repo1 = createFavoritesRepository(filePath);
    await repo1.save({ trackId: "t1", title: "Song A", artist: "Artist A" });

    const repo2 = createFavoritesRepository(filePath);
    expect(await repo2.list()).toHaveLength(1);
    expect(await repo2.has("t1")).toBe(true);
  });
});
