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
