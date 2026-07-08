import { describe, it, expect, vi } from "vitest";
import type { LlmAdapter } from "../adapters/types.js";
import { classifyShowTopic, __internals } from "./classify-show-topic.js";

function makeLlm(response: unknown): LlmAdapter {
  return {
    compute: vi.fn(),
    computeRaw: vi.fn(),
    computeJson: vi.fn().mockResolvedValue(response)
  };
}

describe("classifyShowTopic", () => {
  it("classifies a single artist topic", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["陈奕迅", "Eason Chan"] });
    const result = await classifyShowTopic(llm, "陈奕迅");
    expect(result).toEqual({ kind: "artist", anchors: ["陈奕迅", "Eason Chan"] });
  });

  it("classifies a style topic", async () => {
    const llm = makeLlm({ kind: "style", anchors: ["Britpop", "1990s UK rock"] });
    const result = await classifyShowTopic(llm, "Britpop 黄金年代");
    expect(result.kind).toBe("style");
    expect(result.anchors).toContain("Britpop");
  });

  it("classifies a mood topic", async () => {
    const llm = makeLlm({ kind: "mood", anchors: ["深夜伤感", "late night sad"] });
    const result = await classifyShowTopic(llm, "深夜伤感");
    expect(result.kind).toBe("mood");
  });

  it("returns kind=none for empty topic without calling LLM", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["x"] });
    const result = await classifyShowTopic(llm, "");
    expect(result).toEqual({ kind: "none", anchors: [] });
    expect(llm.computeJson).not.toHaveBeenCalled();
  });

  it("returns kind=none on LLM throw", async () => {
    const llm: LlmAdapter = {
      compute: vi.fn(),
      computeRaw: vi.fn(),
      computeJson: vi.fn().mockRejectedValue(new Error("timeout"))
    };
    const result = await classifyShowTopic(llm, "陈奕迅");
    expect(result).toEqual({ kind: "none", anchors: [] });
  });

  it("returns kind=none when LLM returns invalid kind", async () => {
    const llm = makeLlm({ kind: "weird-kind", anchors: ["x"] });
    const result = await classifyShowTopic(llm, "陈奕迅");
    expect(result).toEqual({ kind: "none", anchors: [] });
  });

  it("filters non-string anchors", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["陈奕迅", 123, null, "  ", "Eason Chan"] });
    const result = await classifyShowTopic(llm, "陈奕迅");
    expect(result.anchors).toEqual(["陈奕迅", "Eason Chan"]);
  });

  it("handles kind=none returned directly", async () => {
    const llm = makeLlm({ kind: "none", anchors: [] });
    const result = await classifyShowTopic(llm, "随便");
    expect(result).toEqual({ kind: "none", anchors: [] });
  });

  it("trims whitespace in anchors", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["  陈奕迅  ", " Eason Chan "] });
    const result = await classifyShowTopic(llm, "陈奕迅");
    expect(result.anchors).toEqual(["陈奕迅", "Eason Chan"]);
  });

  it("trims whitespace in topic input", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["陈奕迅"] });
    await classifyShowTopic(llm, "   陈奕迅   ");
    const calls = (llm.computeJson as any).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toContain("陈奕迅");
  });
});

describe("__internals.parseClassification", () => {
  it("rejects non-object raw values", () => {
    expect(__internals.parseClassification(null)).toBeNull();
    expect(__internals.parseClassification("string")).toBeNull();
    expect(__internals.parseClassification(42)).toBeNull();
  });

  it("rejects unknown kind", () => {
    expect(__internals.parseClassification({ kind: "wat", anchors: [] })).toBeNull();
  });

  it("accepts all valid kinds", () => {
    for (const k of ["artist", "album", "style", "mood", "none"]) {
      const parsed = __internals.parseClassification({ kind: k, anchors: [] });
      expect(parsed?.kind).toBe(k);
    }
  });

  it("defaults to empty anchors when missing", () => {
    const parsed = __internals.parseClassification({ kind: "artist" });
    expect(parsed?.anchors).toEqual([]);
  });
});

describe("classifyShowTopic music search verification", () => {
  function makeMusic(tracks: Array<{ artist: string }>) {
    return {
      search: vi.fn().mockResolvedValue(
        tracks.map((t, i) => ({ id: `t${i}`, title: `song${i}`, artist: t.artist, source: "netease" }))
      ),
      resolve: vi.fn(),
      recommend: vi.fn()
    } as never;
  }

  it("overrides LLM mood misclassification when search proves the topic is an artist", async () => {
    // 模拟"门尼"场景: LLM 不认识小众歌手,误判成 mood;
    // 但网易云搜索结果里多首歌 artist=门尼 → 强制 kind=artist。
    const llm = makeLlm({ kind: "mood", anchors: ["冷门氛围"] });
    const music = makeMusic([
      { artist: "门尼" },
      { artist: "门尼" },
      { artist: "别的歌手" },
      { artist: "门尼" }
    ]);
    const result = await classifyShowTopic(llm, "门尼", music);
    expect(result.kind).toBe("artist");
    expect(result.anchors).toContain("门尼");
  });

  it("overrides LLM failure (none) when search proves artist", async () => {
    const llm: LlmAdapter = {
      compute: vi.fn(),
      computeRaw: vi.fn(),
      computeJson: vi.fn().mockRejectedValue(new Error("timeout"))
    };
    const music = makeMusic([{ artist: "门尼" }, { artist: "门尼 / someone" }]);
    const result = await classifyShowTopic(llm, "门尼", music);
    expect(result.kind).toBe("artist");
    expect(result.anchors).toContain("门尼");
  });

  it("keeps LLM style classification when search shows no artist match", async () => {
    const llm = makeLlm({ kind: "style", anchors: ["Britpop"] });
    const music = makeMusic([{ artist: "Oasis" }, { artist: "Blur" }]);
    const result = await classifyShowTopic(llm, "Britpop", music);
    expect(result.kind).toBe("style");
  });

  it("does not second-guess an LLM artist classification with search", async () => {
    const llm = makeLlm({ kind: "artist", anchors: ["陈奕迅", "Eason Chan"] });
    const music = makeMusic([{ artist: "无关" }]);
    const result = await classifyShowTopic(llm, "陈奕迅", music);
    expect(result.kind).toBe("artist");
    expect((music as { search: ReturnType<typeof vi.fn> }).search).not.toHaveBeenCalled();
  });

  it("requires at least 2 artist hits to override (single hit could be coincidence)", async () => {
    const llm = makeLlm({ kind: "mood", anchors: ["雨天"] });
    const music = makeMusic([{ artist: "雨天" }, { artist: "别人" }]);
    const result = await classifyShowTopic(llm, "雨天", music);
    expect(result.kind).toBe("mood");
  });

  it("skips search verification for long scene-description topics", async () => {
    const llm = makeLlm({ kind: "mood", anchors: ["深夜书房"] });
    const music = makeMusic([{ artist: "x" }]);
    const result = await classifyShowTopic(llm, "一个人深夜在书房写作看书时适合安静听的低刺激音乐合集特别节目", music);
    expect(result.kind).toBe("mood");
    expect((music as { search: ReturnType<typeof vi.fn> }).search).not.toHaveBeenCalled();
  });

  it("survives music search failure", async () => {
    const llm = makeLlm({ kind: "mood", anchors: ["氛围"] });
    const music = {
      search: vi.fn().mockRejectedValue(new Error("netease down")),
      resolve: vi.fn(),
      recommend: vi.fn()
    } as never;
    const result = await classifyShowTopic(llm, "门尼", music);
    expect(result.kind).toBe("mood");
  });
});
