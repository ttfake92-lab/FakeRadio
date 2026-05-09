import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLikedSongsRepository } from "./liked-songs-repository.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "liked-songs-test-"));
}

describe("createLikedSongsRepository", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, "user"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns diagnostics with loaded=false when file is missing", async () => {
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(false);
    expect(diagnostics.totalCount).toBe(0);
    expect(diagnostics.validCount).toBe(0);
    expect(diagnostics.invalidCount).toBe(0);
    expect(diagnostics.samples).toEqual([]);
  });

  it("returns diagnostics with loaded=false for empty array", async () => {
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "[]", "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(true);
    expect(diagnostics.totalCount).toBe(0);
    expect(diagnostics.validCount).toBe(0);
    expect(diagnostics.samples).toEqual([]);
  });

  it("returns diagnostics for valid array with multiple songs", async () => {
    const data = [
      {
        id: 1,
        name: "Song One",
        ar: [{ name: "Artist A" }],
        al: { name: "Album A", picUrl: "https://example.com/pic1.jpg" }
      },
      {
        id: 2,
        name: "Song Two",
        ar: [{ name: "Artist B" }],
        al: { name: "Album B", picUrl: "https://example.com/pic2.jpg" }
      }
    ];
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), JSON.stringify(data), "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(true);
    expect(diagnostics.totalCount).toBe(2);
    expect(diagnostics.validCount).toBe(2);
    expect(diagnostics.invalidCount).toBe(0);
    expect(diagnostics.samples).toHaveLength(2);
    expect(diagnostics.samples[0]).toEqual({
      id: "1",
      title: "Song One",
      artist: "Artist A",
      album: "Album A"
    });
  });

  it("returns diagnostics for array with missing fields", async () => {
    const data = [
      {
        id: 1,
        name: "Valid Song",
        ar: [{ name: "Artist A" }],
        al: { name: "Album A", picUrl: "https://example.com/pic1.jpg" }
      },
      {
        id: 2,
        name: "Missing Artist"
        // missing ar and al
      },
      {
        id: 3,
        name: "",
        ar: [{ name: "Artist C" }],
        al: { name: "Album C" }
      }
    ];
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), JSON.stringify(data), "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(true);
    expect(diagnostics.totalCount).toBe(3);
    expect(diagnostics.validCount).toBe(1);
    expect(diagnostics.invalidCount).toBe(2);
    expect(diagnostics.samples).toHaveLength(1);
  });

  it("returns diagnostics for illegal JSON", async () => {
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), "{ invalid json }", "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(false);
    expect(diagnostics.totalCount).toBe(0);
    expect(diagnostics.validCount).toBe(0);
    expect(diagnostics.samples).toEqual([]);
  });

  it("limits samples to max 3", async () => {
    const data = [
      {
        id: 1,
        name: "Song 1",
        ar: [{ name: "Artist 1" }],
        al: { name: "Album 1" }
      },
      {
        id: 2,
        name: "Song 2",
        ar: [{ name: "Artist 2" }],
        al: { name: "Album 2" }
      },
      {
        id: 3,
        name: "Song 3",
        ar: [{ name: "Artist 3" }],
        al: { name: "Album 3" }
      },
      {
        id: 4,
        name: "Song 4",
        ar: [{ name: "Artist 4" }],
        al: { name: "Album 4" }
      }
    ];
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), JSON.stringify(data), "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.totalCount).toBe(4);
    expect(diagnostics.samples).toHaveLength(3);
  });

  it("list returns normalized tracks", async () => {
    const data = [
      {
        id: 12345,
        name: "Test Song",
        ar: [{ name: "Test Artist" }],
        al: { name: "Test Album", picUrl: "https://example.com/pic.jpg" }
      }
    ];
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), JSON.stringify(data), "utf-8");
    const repo = createLikedSongsRepository(dir);
    const tracks = await repo.list();

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual({
      id: "12345",
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      artworkUrl: "https://example.com/pic.jpg",
      source: "netease"
    });
  });

  it("list returns empty array when file is missing", async () => {
    const repo = createLikedSongsRepository(dir);
    const tracks = await repo.list();

    expect(tracks).toEqual([]);
  });

  it("handles missing optional fields gracefully", async () => {
    const data = [
      {
        id: 1,
        name: "Minimal Song",
        ar: [{ name: "Solo Artist" }],
        al: { name: "Minimal Album" }
      }
    ];
    writeFileSync(join(dir, "user/netease-liked-songs.raw.json"), JSON.stringify(data), "utf-8");
    const repo = createLikedSongsRepository(dir);
    const diagnostics = await repo.getDiagnostics();

    expect(diagnostics.loaded).toBe(true);
    expect(diagnostics.validCount).toBe(1);
  });
});
