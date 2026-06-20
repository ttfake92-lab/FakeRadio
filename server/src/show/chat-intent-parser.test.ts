import { describe, expect, it } from "vitest";
import { parseChatIntent, createBriefFromIntent } from "./chat-intent-parser.js";

describe("parseChatIntent", () => {
  describe("theme-show intent", () => {
    it("recognizes '帮我做一期围绕 Bee Gees 展开的主题节目'", () => {
      const result = parseChatIntent("帮我做一期围绕 Bee Gees 展开的主题节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("theme-show");
        expect(result.topic).toBe("Bee Gees");
        expect(result.scope).toBe("full-show");
      }
    });

    it("recognizes '做一个 ABBA 主题节目'", () => {
      const result = parseChatIntent("做一个 ABBA 主题节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("theme-show");
        expect(result.topic).toBe("ABBA");
      }
    });

    it("recognizes '来一期 Beatles 主题节目'", () => {
      const result = parseChatIntent("来一期 Beatles 主题节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("theme-show");
        expect(result.topic).toBe("Beatles");
      }
    });

    it("recognizes '帮我制作一个爵士主题节目'", () => {
      const result = parseChatIntent("帮我制作一个爵士主题节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("theme-show");
        expect(result.topic).toBe("爵士");
      }
    });
  });

  describe("block-theme intent", () => {
    it("recognizes '今晚安排一期 Bee Gees 相关节目'", () => {
      const result = parseChatIntent("今晚安排一期 Bee Gees 相关节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("block-theme");
        expect(result.topic).toBe("Bee Gees");
        expect(result.scope).toBe("block");
        expect(result.targetBlockAt).toBeDefined();
      }
    });

    it("recognizes '明早安排一期爵士节目'", () => {
      const result = parseChatIntent("明早安排一期爵士节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("block-theme");
        expect(result.topic).toBe("爵士");
        expect(result.scope).toBe("block");
      }
    });

    it("recognizes '下午做一期电子节目'", () => {
      const result = parseChatIntent("下午做一期电子节目");
      expect(result.isProductionIntent).toBe(true);
      if (result.isProductionIntent) {
        expect(result.type).toBe("block-theme");
        expect(result.topic).toBe("电子");
      }
    });
  });

  describe("weak expressions", () => {
    it("does not create brief for '我喜欢 Bee Gees'", () => {
      const result = parseChatIntent("我喜欢 Bee Gees");
      expect(result.isProductionIntent).toBe(false);
    });

    it("does not create brief for '最近在听爵士'", () => {
      const result = parseChatIntent("最近在听爵士");
      expect(result.isProductionIntent).toBe(false);
    });

    it("does not create brief for '推荐点摇滚'", () => {
      const result = parseChatIntent("推荐点摇滚");
      expect(result.isProductionIntent).toBe(false);
    });

    it("does not create brief for '想听点轻松的'", () => {
      const result = parseChatIntent("想听点轻松的");
      expect(result.isProductionIntent).toBe(false);
    });

    it("does not create brief for ordinary time-scoped music requests", () => {
      expect(parseChatIntent("今晚想听 Bee Gees 相关的东西").isProductionIntent).toBe(false);
      expect(parseChatIntent("明早听爵士").isProductionIntent).toBe(false);
      expect(parseChatIntent("下午听电子").isProductionIntent).toBe(false);
    });

    it("does not create brief for '随便来点音乐'", () => {
      const result = parseChatIntent("随便来点音乐");
      expect(result.isProductionIntent).toBe(false);
    });
  });

  describe("ambiguous cases", () => {
    it("returns false for plain chat messages", () => {
      const result = parseChatIntent("今天天气怎么样");
      expect(result.isProductionIntent).toBe(false);
    });

    it("returns false for short greetings", () => {
      const result = parseChatIntent("你好");
      expect(result.isProductionIntent).toBe(false);
    });
  });
});

describe("createBriefFromIntent", () => {
  it("creates a theme-show brief from intent", () => {
    const intent = {
      isProductionIntent: true as const,
      type: "theme-show" as const,
      topic: "Bee Gees",
      scope: "full-show" as const,
      priority: "user-requested" as const
    };

    const brief = createBriefFromIntent(intent, "2026-05-12", "msg-123");

    expect(brief.type).toBe("theme-show");
    expect(brief.topic).toBe("Bee Gees");
    expect(brief.scope).toBe("full-show");
    expect(brief.targetDate).toBe("2026-05-12");
    expect(brief.status).toBe("draft");
    expect(brief.createdFromMessageId).toBe("msg-123");
  });

  it("creates a block-theme brief with targetBlockAt", () => {
    const intent = {
      isProductionIntent: true as const,
      type: "block-theme" as const,
      topic: "Bee Gees",
      scope: "block" as const,
      priority: "user-requested" as const,
      targetBlockAt: "2026-05-12T20:00:00.000Z"
    };

    const brief = createBriefFromIntent(intent, "2026-05-12");

    expect(brief.type).toBe("block-theme");
    expect(brief.scope).toBe("block");
    expect(brief.targetBlockAt).toBe("2026-05-12T20:00:00.000Z");
  });
});
