import { describe, it, expect } from "vitest";
import { extractMentionedEntities } from "./chat-sse-handler.js";
import { extractTasteKeywords } from "../recommendation/recommendation-engine.js";

describe("extractMentionedEntities sanity", () => {
  const ext = (m: string) => extractMentionedEntities(m, extractTasteKeywords);

  it("提取多词英文艺术家名", () => {
    expect(ext("推荐 Pink Floyd")).toContain("Pink Floyd");
    expect(ext("来点 Led Zeppelin")).toContain("Led Zeppelin");
  });

  it("提取书名号/引号内容", () => {
    expect(ext("放 Pink Floyd 的《Wish You Were Here》")).toContain("Wish You Were Here");
    expect(ext("放 \"Bohemian Rhapsody\"")).toContain("Bohemian Rhapsody");
  });

  it("纯风格词不当作实体（留给 playQuery）", () => {
    const e = ext("给我来点摇滚");
    expect(e).not.toContain("摇滚");
    const e2 = ext("放点爵士");
    expect(e2).not.toContain("爵士");
  });

  it("带变音符的非 ASCII 艺术家名", () => {
    expect(ext("换首 Sigur Rós")).toContain("Sigur Rós");
  });
});
