import { describe, expect, it } from "vitest";
import { parseBriefIntent, createBriefFromIntent } from "./brief-intent-parser.js";

describe("brief-intent-parser", () => {
  it("parses theme-show intent", () => {
    const result = parseBriefIntent("帮我做一期 Bee Gees 主题节目", new Date());
    expect(result.isBriefIntent).toBe(true);
    if (result.isBriefIntent) {
      expect(result.type).toBe("theme-show");
      expect(result.topic).toBe("Bee Gees");
      expect(result.scope).toBe("full-show");
    }
  });

  it("parses block-theme intent", () => {
    const result = parseBriefIntent("今晚安排一期 Bee Gees", new Date(2026, 4, 12, 10, 0, 0));
    expect(result.isBriefIntent).toBe(true);
    if (result.isBriefIntent) {
      expect(result.type).toBe("block-theme");
      expect(result.topic).toBe("Bee Gees");
      expect(result.scope).toBe("block");
      expect(result.targetBlockAt).toBeDefined();
    }
  });

  it("returns false for weak expression", () => {
    const result = parseBriefIntent("我喜欢 Bee Gees", new Date());
    expect(result.isBriefIntent).toBe(false);
  });

  it("returns false for ordinary music requests", () => {
    const result = parseBriefIntent("今晚想听 Bee Gees", new Date());
    expect(result.isBriefIntent).toBe(false);
  });

  it("returns false for casual chat", () => {
    const result = parseBriefIntent("今天天气怎么样", new Date());
    expect(result.isBriefIntent).toBe(false);
  });

  it("creates brief from intent", () => {
    const intent = parseBriefIntent("帮我做一期 ABBA 主题节目", new Date());
    expect(intent.isBriefIntent).toBe(true);
    if (intent.isBriefIntent) {
      const brief = createBriefFromIntent(intent, "2026-05-12", "user-requested");
      expect(brief.type).toBe("theme-show");
      expect(brief.topic).toBe("ABBA");
      expect(brief.status).toBe("draft");
      expect(brief.targetDate).toBe("2026-05-12");
    }
  });
});
