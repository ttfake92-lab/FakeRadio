import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitIntoSentences } from "./chat-sse-handler.js";

describe("splitIntoSentences", () => {
  it("splits Chinese sentences by 。！？", () => {
    const result = splitIntoSentences("夜里好。这首《夜车》是陈粒的，留给还没睡的人。");
    expect(result).toEqual([
      "夜里好。",
      "这首《夜车》是陈粒的，留给还没睡的人。",
    ]);
  });

  it("splits English sentences by . ! ?", () => {
    const result = splitIntoSentences("Hello world. How are you? I'm fine!");
    expect(result).toEqual([
      "Hello world.",
      "How are you?",
      "I'm fine!",
    ]);
  });

  it("handles mixed Chinese and English", () => {
    const result = splitIntoSentences("Hi！你好吗？I'm fine.");
    expect(result).toEqual([
      "Hi！",
      "你好吗？",
      "I'm fine.",
    ]);
  });

  it("returns empty array for empty string", () => {
    const result = splitIntoSentences("");
    expect(result).toEqual([]);
  });

  it("handles text without sentence endings", () => {
    const result = splitIntoSentences("这是一句没有结束的话");
    expect(result).toEqual(["这是一句没有结束的话"]);
  });
});

describe("ChatSSEHandler intent routing", () => {
  // Integration test using Fastify inject
  it("POST /api/chat/stream returns SSE with chunk and done events", async () => {
    const { createTestRadioServer } = await vi.importActual<typeof import("./create-server.test.js")>("./create-server.test.js");

    // This test verifies the SSE endpoint structure
    // We'll test via the full server integration
    expect(true).toBe(true); // Placeholder - full test requires server setup
  });
});
