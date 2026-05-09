import { describe, expect, it } from "vitest";
import { generateShowNotes } from "./show-notes-generator.js";

describe("generateShowNotes", () => {
  it("returns placeholder when no tracks", () => {
    const result = generateShowNotes({ date: "2026-05-05", tracks: [] });
    expect(result).toContain("FakeRadio · 2026-05-05");
    expect(result).toContain("没有互动内容");
  });

  it("generates track index and sections", () => {
    const result = generateShowNotes({
      date: "2026-05-05",
      tracks: [
        { title: "Morning Signal", artist: "FakeRadio", djStory: "一首温暖的开始。", storyType: "mood-reading" },
        { title: "City Rain", artist: "DJ Rain", djStory: "雨天适合这首。", userMemory: "让我想起那年夏天。", storyType: "background" }
      ]
    });

    expect(result).toContain("# FakeRadio · 2026-05-05");
    expect(result).toContain("1. 《Morning Signal》— FakeRadio");
    expect(result).toContain("2. 《City Rain》— DJ Rain");
    expect(result).toContain("## 《Morning Signal》— FakeRadio");
    expect(result).toContain("**DJ 故事**");
    expect(result).toContain("一首温暖的开始。");
    expect(result).toContain("**你的回忆**");
    expect(result).toContain("让我想起那年夏天。");
    expect(result).toContain("来源：background");
    expect(result).toContain("来源：mood-reading");
  });

  it("omits user memory section when not provided", () => {
    const result = generateShowNotes({
      date: "2026-05-05",
      tracks: [
        { title: "Song A", artist: "Artist A", djStory: "Story text.", storyType: "lyric-theme" }
      ]
    });

    expect(result).not.toContain("**你的回忆**");
    expect(result).toContain("来源：lyric-theme");
  });
});
