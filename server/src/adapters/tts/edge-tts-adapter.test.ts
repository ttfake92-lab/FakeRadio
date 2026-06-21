import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createEdgeTtsAdapter } from "./edge-tts-adapter.js";
import * as edgeTts from "edge-tts";

vi.mock("edge-tts", () => ({
  tts: vi.fn()
}));

function edgeCacheKey(voice: string, rate: number, text: string): string {
  return createHash("sha256")
    .update(`edge:${voice}:${rate}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

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
    const cacheKey = edgeCacheKey("zh-CN-XiaoxiaoNeural", 0, text);
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

    expect(edgeTts.tts).toHaveBeenCalledWith("new text", { voice: "zh-CN-XiaoxiaoNeural", rate: "+0%" });
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

    expect(edgeTts.tts).toHaveBeenCalledWith("hello", { voice: "en-US-JennyNeural", rate: "+0%" });
  });

  it("passes rate to edge-tts as percentage string", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter = createEdgeTtsAdapter({
      cacheDir: tempDir,
      rate: 50
    });

    await adapter.synthesize("快一点");

    expect(edgeTts.tts).toHaveBeenCalledWith("快一点", { voice: "zh-CN-XiaoxiaoNeural", rate: "+50%" });
  });

  it("formats negative rate correctly", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter = createEdgeTtsAdapter({
      cacheDir: tempDir,
      rate: -20
    });

    await adapter.synthesize("慢一点");

    expect(edgeTts.tts).toHaveBeenCalledWith("慢一点", { voice: "zh-CN-XiaoxiaoNeural", rate: "-20%" });
  });

  it("different voices produce different cache keys (regression: key must include voice)", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter1 = createEdgeTtsAdapter({ cacheDir: tempDir, voice: "zh-CN-XiaoxiaoNeural" });
    const adapter2 = createEdgeTtsAdapter({ cacheDir: tempDir, voice: "zh-CN-YunxiNeural" });

    const r1 = await adapter1.synthesize("同一句话");
    const r2 = await adapter2.synthesize("同一句话");

    expect(r1.cacheKey).not.toBe(r2.cacheKey);
    expect(edgeTts.tts).toHaveBeenCalledTimes(2);
  });

  it("different rates produce different cache keys", async () => {
    vi.mocked(edgeTts.tts).mockResolvedValue(Buffer.from("new audio"));

    const adapter1 = createEdgeTtsAdapter({ cacheDir: tempDir, rate: 0 });
    const adapter2 = createEdgeTtsAdapter({ cacheDir: tempDir, rate: 50 });

    const r1 = await adapter1.synthesize("同一句话");
    const r2 = await adapter2.synthesize("同一句话");

    expect(r1.cacheKey).not.toBe(r2.cacheKey);
    expect(edgeTts.tts).toHaveBeenCalledTimes(2);
  });
});
