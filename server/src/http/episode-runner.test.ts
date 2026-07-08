import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { narrateStoryWithSources, synthesizeWithFallback } from "./episode-runner.js";
import type { LlmAdapter, TtsAdapter } from "../adapters/types.js";
import type { Track, RadioEpisode, DjDecision } from "@fakeradio/shared";

function makeLlm(says: string[]): { llm: LlmAdapter; calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const llm = {
    async compute(fragments: Array<{ id: string; content: string }>): Promise<DjDecision> {
      const system = fragments.find((f) => f.id === "system")?.content ?? "";
      calls.push(system);
      const say = says[Math.min(index, says.length - 1)] ?? "";
      index += 1;
      return { say, play: { reason: "test" }, reason: "test", segue: "" };
    },
    async computeJson<T>(): Promise<T> {
      throw new Error("not used");
    }
  } as unknown as LlmAdapter;
  return { llm, calls };
}

const NARRATE_ARGS = {
  sources: [] as RadioEpisode["sources"],
  systemPrompt: "persona",
  recentMemory: [] as string[],
  contextEnv: { weather: { summary: "sunny", moodHint: "calm" }, calendar: [], devices: [] },
  userTaste: "",
  routines: "",
  moodRules: ""
};

function callNarrate(llm: LlmAdapter, track: Track) {
  return narrateStoryWithSources(
    llm,
    track,
    NARRATE_ARGS.sources,
    NARRATE_ARGS.systemPrompt,
    NARRATE_ARGS.recentMemory,
    NARRATE_ARGS.contextEnv,
    NARRATE_ARGS.userTaste,
    NARRATE_ARGS.routines,
    NARRATE_ARGS.moodRules
  );
}

describe("narrateStoryWithSources validation", () => {
  const liveTrack: Track = {
    id: "t1",
    title: "High Hopes (Live In Gdansk)",
    artist: "David Gilmour / Pink Floyd",
    source: "netease"
  } as Track;

  it("accepts narration that mentions only the core title without suffixes", async () => {
    const { llm, calls } = makeLlm(["这段时间放 High Hopes 正合适，慢慢听。"]);
    const result = await callNarrate(llm, liveTrack);
    expect(result.narration).toContain("High Hopes");
    expect(calls.length).toBe(1);
  });

  it("accepts narration that mentions one artist of a multi-artist credit", async () => {
    const { llm, calls } = makeLlm(["Pink Floyd 的东西，这个点听最好。"]);
    const result = await callNarrate(llm, liveTrack);
    expect(result.narration).toContain("Pink Floyd");
    expect(calls.length).toBe(1);
  });

  it("retries once with feedback before falling back", async () => {
    const { llm, calls } = makeLlm([
      "这首歌背后有一个动人的故事，让我们一起聆听。",
      "重写后的版本: High Hopes，就现在放。"
    ]);
    const result = await callNarrate(llm, liveTrack);
    expect(result.narration).toContain("High Hopes");
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain("重写要求");
    expect(calls[1]).toContain("禁止使用");
  });

  it("uses varied fallback when both attempts fail validation", async () => {
    const bad = ["完全无关的口播。", "还是无关的口播。"];
    const trackA = { ...liveTrack, id: "aaa" } as Track;
    const trackB = { ...liveTrack, id: "zzzz" } as Track;
    const resultA = await callNarrate(makeLlm(bad).llm, trackA);
    const resultB = await callNarrate(makeLlm(bad).llm, trackB);
    // 兜底文案必须包含曲目信息
    expect(resultA.narration).toContain("High Hopes");
    // 不同 track.id 应有机会命中不同模板(确定性哈希,这两个 id 取模不同)
    expect(resultA.narration).not.toBe(resultB.narration);
  });
});

describe("synthesizeWithFallback", () => {
  it("uses an audible local fallback when primary TTS fails", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "episode-runner-tts-test-"));
    const primary: TtsAdapter = {
      async synthesize() {
        throw new Error("primary down");
      }
    };
    const audibleFallback: TtsAdapter = {
      async synthesize(text) {
        return { text, audioUrl: "/cache/tts/local-fallback.m4a", cacheKey: "local-fallback" };
      }
    };

    try {
      const result = await synthesizeWithFallback(primary, cacheDir, "测试口播", {
        audibleFallback
      });

      expect(result.result.audioUrl).toBe("/cache/tts/local-fallback.m4a");
      expect(result.fallbackReason).toContain("local audible TTS");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("throws when both primary TTS and local audible fallback fail", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "episode-runner-tts-test-"));
    const primary: TtsAdapter = {
      async synthesize() {
        throw new Error("primary down");
      }
    };
    const audibleFallback: TtsAdapter = {
      async synthesize() {
        throw new Error("local down");
      }
    };

    try {
      await expect(
        synthesizeWithFallback(primary, cacheDir, "测试口播", {
          audibleFallback
        })
      ).rejects.toThrow("TTS synthesis failed and local audible fallback failed");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
