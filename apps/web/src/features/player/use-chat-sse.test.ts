import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useChatSSE logic", () => {
  // Test the SSE parsing logic that would be used inside sendMessage
  function parseSSEBuffer(buffer: string, lines: string[]): { buffer: string; chunks: string[]; dones: object[] } {
    const chunks: string[] = [];
    const dones: object[] = [];
    let eventType = "";
    let dataBuffer = "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
        continue;
      }
      if (line.startsWith("data: ")) {
        dataBuffer = line.slice(6).trim();
        continue;
      }
      if (line === "") {
        // End of event
        if ((eventType === "chunk" || eventType === "") && dataBuffer) {
          chunks.push(dataBuffer);
        } else if (eventType === "done" && dataBuffer) {
          try {
            dones.push(JSON.parse(dataBuffer));
          } catch {
            dones.push({ text: dataBuffer });
          }
        }
        eventType = "";
        dataBuffer = "";
      }
    }
    return { buffer: dataBuffer, chunks, dones };
  }

  it("parses chunk and done events from SSE lines", () => {
    const lines = [
      "event: chunk",
      "data: 你好",
      "",
      "event: done",
      'data: {"text":"你好","action":null}',
      "",
    ];
    const { chunks, dones } = parseSSEBuffer("", lines);
    expect(chunks).toContain("你好");
    expect(dones[0]).toMatchObject({ text: "你好" });
  });

  it("handles multiple chunk events", () => {
    const lines = [
      "event: chunk",
      "data: 第一句。",
      "",
      "event: chunk",
      "data: 第二句。",
      "",
      "event: done",
      'data: {"text":"第一句。第二句。","action":null}',
      "",
    ];
    const { chunks, dones } = parseSSEBuffer("", lines);
    expect(chunks).toEqual(["第一句。", "第二句。"]);
    expect(dones[0]).toMatchObject({ text: "第一句。第二句。" });
  });

  it("handles raw data without event prefix", () => {
    // Some SSE servers send raw text without event: line
    const lines = ["data: 你好吗", ""];
    const { chunks } = parseSSEBuffer("", lines);
    expect(chunks).toContain("你好吗");
  });

  it("returns empty for incomplete event", () => {
    const lines = ["event: chunk", "data: partial"];
    const { chunks, dones } = parseSSEBuffer("", lines);
    expect(chunks).toEqual([]);
    expect(dones).toEqual([]);
  });
});
