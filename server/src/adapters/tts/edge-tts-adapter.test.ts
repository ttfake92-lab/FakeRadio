import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeTtsAdapter } from "./edge-tts-adapter.js";
import { hashText } from "./tts-cache-manager.js";
import * as edgeTts from "edge-tts";

vi.mock("edge-tts", () => ({
  tts: vi.fn()
}));

describe("createEdgeTtsAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "edge-tts-test-"));
    vi.mocked(edgeTts.tts).mockClear();
  });

  afterEach(() => {
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch {}
  });

  it("returns cached result when cache hit", async () => {
    const text = "hello world";
    const cacheKey = hashText(text);
    writeFileSync(`${tempDir}/${cacheKey}.mp3`, Buffer.from("cached audio"));

    const adapter = createEdgeTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/test-cache"
    });

    const result = await adapter.synthesize(text);

    expect(edgeTts.tts).not.toHaveBeenCalled();
    expect(result.audioUrl).toBe(`/test-cache/${cacheKey}.mp3`);
    expect(result.text).toBe("hello world");
  });

  it("calls tts and saves on cache miss", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter = createEdgeTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/test-cache"
    });

    const result = await adapter.synthesize("new text");

    expect(edgeTts.tts).toHaveBeenCalledWith("new text", { voice: "zh-CN-XiaoxiaoNeural" });
    expect(result.audioUrl).toMatch(/^\/test-cache\/[a-f0-9]{16}\.mp3$/);
    expect(result.text).toBe("new text");
  });

  it("uses custom voice when provided", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter = createEdgeTtsAdapter({
      cacheDir: tempDir,
      voice: "en-US-JennyNeural"
    });

    await adapter.synthesize("hello");

    expect(edgeTts.tts).toHaveBeenCalledWith("hello", { voice: "en-US-JennyNeural" });
  });
});
