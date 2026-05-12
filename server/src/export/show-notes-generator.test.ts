import { describe, expect, it } from "vitest";
import { generateShowNotes } from "./show-notes-generator.js";
import type { ShowNotesInput } from "./show-notes-generator.js";
import type { ShowPlan, ShowPlanBlock } from "@fakeradio/shared";

const makePlanBlock = (overrides: Partial<ShowPlanBlock> = {}): ShowPlanBlock => ({
  role: "origin",
  title: "Test Block",
  storyGoal: "Test story goal",
  selectionGoal: "Test selection goal",
  sourceNeeds: [],
  constraints: {},
  episodeTargets: [],
  ...overrides,
});

const makeShowPlan = (blocks: ShowPlanBlock[]): ShowPlan => ({
  id: "plan-1",
  briefId: "brief-1",
  version: 1,
  active: true,
  briefSnapshot: {
    id: "brief-1",
    type: "theme-show",
    topic: "Bee Gees",
    targetDate: "2026-05-12",
    priority: "user-requested",
    status: "confirmed",
    createdAt: "2026-05-12T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
  },
  blocks,
  totalDurationMinutes: 60,
  createdAt: "2026-05-12T10:00:00Z",
  updatedAt: "2026-05-12T10:00:00Z",
});

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

  it("includes block summaries when showPlan is provided", () => {
    const showPlan = makeShowPlan([
      makePlanBlock({ role: "opening", title: "The Disco Era Begins", storyGoal: "Set the stage for Bee Gees" }),
      makePlanBlock({ role: "signature-era", title: "Saturday Night Fever", storyGoal: "The peak of their career" }),
      makePlanBlock({ role: "closing", title: "Legacy", storyGoal: "Wrap up the journey" }),
    ]);
    const result = generateShowNotes({
      date: "2026-05-12",
      tracks: [],
      showPlan,
    });

    expect(result).toContain("# FakeRadio · 2026-05-12");
    expect(result).toContain("## 节目纲要");
    expect(result).toContain("Bee Gees");
    expect(result).toContain("opening");
    expect(result).toContain("The Disco Era Begins");
    expect(result).toContain("signature-era");
    expect(result).toContain("Saturday Night Fever");
    expect(result).toContain("closing");
    expect(result).toContain("Legacy");
    expect(result).toContain("3 个段落");
  });

  it("includes block role in block section", () => {
    const showPlan = makeShowPlan([
      makePlanBlock({ role: "origin", title: "Irish Roots", storyGoal: "Where it all started" }),
    ]);
    const result = generateShowNotes({
      date: "2026-05-12",
      tracks: [],
      showPlan,
    });

    expect(result).toContain("## 节目纲要");
    expect(result).toContain("**origin** · Irish Roots");
    expect(result).toContain("Where it all started");
  });

  it("marks external tracks with source reason when provided", () => {
    const result = generateShowNotes({
      date: "2026-05-12",
      tracks: [
        {
          title: "Stayin' Alive",
          artist: "Bee Gees",
          djStory: "Iconic disco anthem.",
          storyType: "background",
          externalTrack: true,
          externalReason: "signature-era — representative work of the Saturday Night Fever era",
        },
      ],
    });

    expect(result).toContain("Stayin' Alive");
    expect(result).toContain("库外曲目");
    expect(result).toContain("signature-era — representative work of the Saturday Night Fever era");
  });

  it("does not mark user library tracks as external", () => {
    const result = generateShowNotes({
      date: "2026-05-12",
      tracks: [
        {
          title: "Night Fever",
          artist: "Bee Gees",
          djStory: "Disco classic.",
          storyType: "background",
          externalTrack: false,
        },
      ],
    });

    expect(result).not.toContain("库外曲目");
    expect(result).toContain("Night Fever");
  });
});
