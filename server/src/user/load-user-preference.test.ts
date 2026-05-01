import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUserPreferences, DEFAULT_PLAYLISTS } from "./load-user-preference.js";

describe("loadUserPreferences", () => {
  let tempDir: string;
  let userDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fakeradio-user-test-"));
    userDir = join(tempDir, "user");
    mkdirSync(userDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true });
    } catch {}
  });

  it("returns file contents when user preference files exist", async () => {
    writeFileSync(join(userDir, "taste.md"), "Custom taste content.");
    writeFileSync(join(userDir, "routines.md"), "Custom routines content.");
    writeFileSync(join(userDir, "mood-rules.md"), "Custom mood rules content.");

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.taste).toBe("Custom taste content.");
    expect(prefs.routines).toBe("Custom routines content.");
    expect(prefs.moodRules).toBe("Custom mood rules content.");
  });

  it("returns fallback values when files are missing", async () => {
    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.taste).toBe("喜欢低刺激、持续陪伴的音乐。");
    expect(prefs.routines).toBe("早晨低刺激启动，工作时段稳定少打扰。");
    expect(prefs.moodRules).toBe("晴天早晨温暖轻盈。");
    expect(prefs.playlists).toEqual(DEFAULT_PLAYLISTS);
  });

  it("trims whitespace from file contents", async () => {
    writeFileSync(join(userDir, "taste.md"), "  \nTrimmed content\n  ");

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.taste).toBe("Trimmed content");
  });

  it("returns fallback when user directory does not exist", async () => {
    const nonExistentDir = join(tempDir, "nonexistent");

    const prefs = await loadUserPreferences(nonExistentDir);

    expect(prefs.taste).toBe("喜欢低刺激、持续陪伴的音乐。");
    expect(prefs.routines).toBe("早晨低刺激启动，工作时段稳定少打扰。");
    expect(prefs.moodRules).toBe("晴天早晨温暖轻盈。");
    expect(prefs.playlists).toEqual(DEFAULT_PLAYLISTS);
  });

  it("loads playlists from valid JSON", async () => {
    const playlists = [
      {
        id: "focus-coding",
        name: "写代码专注",
        description: "稳定节奏、少人声、适合持续工作。",
        seeds: ["instrumental focus", "minimal electronic", "lofi coding"]
      }
    ];
    writeFileSync(join(userDir, "playlists.json"), JSON.stringify(playlists));

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.playlists).toHaveLength(1);
    expect(prefs.playlists[0].id).toBe("focus-coding");
    expect(prefs.playlists[0].seeds).toEqual(["instrumental focus", "minimal electronic", "lofi coding"]);
  });

  it("falls back to default playlists when JSON is invalid", async () => {
    writeFileSync(join(userDir, "playlists.json"), "not json");

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.playlists).toEqual(DEFAULT_PLAYLISTS);
  });

  it("falls back to default playlists when JSON shape is wrong", async () => {
    writeFileSync(join(userDir, "playlists.json"), JSON.stringify([{ id: "only-id" }]));

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.playlists).toEqual(DEFAULT_PLAYLISTS);
  });

  it("falls back to default playlists when JSON is not an array", async () => {
    writeFileSync(join(userDir, "playlists.json"), JSON.stringify({ id: "not-array" }));

    const prefs = await loadUserPreferences(tempDir);

    expect(prefs.playlists).toEqual(DEFAULT_PLAYLISTS);
  });
});
