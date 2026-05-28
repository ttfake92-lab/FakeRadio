import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { inferAndSaveTaste } from "./taste-inferer.js";
import type { LlmAdapter } from "../adapters/types.js";
import type { UserPreferences } from "./load-user-preference.js";
import type { ContextFragment } from "@fakeradio/shared";

const DEFAULT_PREFERENCES: UserPreferences = {
  taste: "喜欢低刺激、持续陪伴的音乐。",
  routines: "早晨偏温暖、轻盈。",
  moodRules: "避免突然大音量。",
  playlists: [],
};

function createSpyLlmAdapter(response: string): LlmAdapter & { lastFragments: ContextFragment[] } {
  const adapter: LlmAdapter & { lastFragments: ContextFragment[] } = {
    lastFragments: [],
    async computeRaw(fragments) {
      adapter.lastFragments = fragments;
      return response;
    },
    async compute() {
      throw new Error("not implemented");
    },
  };
  return adapter;
}

describe("inferAndSaveTaste", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "taste-infer-test-"));
    const userDir = resolve(baseDir, "user");
    mkdirSync(userDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("calls LLM with session summary and favorites in prompt", async () => {
    const initialTaste = "喜欢独立民谣。";
    writeFileSync(resolve(baseDir, "user/taste.md"), initialTaste, "utf-8");

    const llm = createSpyLlmAdapter("更新后的品味：喜欢独立民谣和梦幻流行。");
    const sessionSummary = "[user] 播放一首轻松的歌\n[agent] 好的，为你播放...";
    const favList = "Yesterday - The Beatles, Let It Be - The Beatles";

    await inferAndSaveTaste({
      baseDir,
      llm,
      userPreferences: DEFAULT_PREFERENCES,
      sessionSummary,
      favList,
      userMessage: "日终品味推断",
    });

    const systemFragment = llm.lastFragments.find((f) => f.source === "system");
    expect(systemFragment).toBeDefined();
    expect(systemFragment!.content).toContain(initialTaste);
    expect(systemFragment!.content).toContain(sessionSummary);
    expect(systemFragment!.content).toContain(favList);
  });

  it("writes LLM response to taste.md", async () => {
    writeFileSync(resolve(baseDir, "user/taste.md"), "旧品味内容。", "utf-8");

    const updatedTaste = "更新后的品味：喜欢独立民谣和梦幻流行。";
    const llm = createSpyLlmAdapter(updatedTaste);

    const result = await inferAndSaveTaste({
      baseDir,
      llm,
      userPreferences: DEFAULT_PREFERENCES,
      sessionSummary: "[user] 播放一首轻松的歌",
      favList: "",
      userMessage: "日终品味推断",
    });

    expect(result).toBe(updatedTaste);
    const written = readFileSync(resolve(baseDir, "user/taste.md"), "utf-8");
    expect(written.trim()).toBe(updatedTaste);
  });

  it("creates backup of taste.md before overwriting", async () => {
    const originalContent = "原始品味内容。";
    writeFileSync(resolve(baseDir, "user/taste.md"), originalContent, "utf-8");

    const llm = createSpyLlmAdapter("新品味内容。");

    await inferAndSaveTaste({
      baseDir,
      llm,
      userPreferences: DEFAULT_PREFERENCES,
      sessionSummary: "[user] 播放一首轻松的歌",
      favList: "",
      userMessage: "日终品味推断",
    });

    const backup = readFileSync(resolve(baseDir, "user/taste.md.bak"), "utf-8");
    expect(backup.trim()).toBe(originalContent);
  });

  it("uses default taste when taste.md does not exist", async () => {
    const llm = createSpyLlmAdapter("品味更新。");

    await inferAndSaveTaste({
      baseDir,
      llm,
      userPreferences: DEFAULT_PREFERENCES,
      sessionSummary: "[user] 播放一首轻松的歌",
      favList: "",
      userMessage: "日终品味推断",
    });

    const systemFragment = llm.lastFragments.find((f) => f.source === "system");
    expect(systemFragment!.content).toContain("喜欢低刺激、持续陪伴的音乐。");
  });
});
