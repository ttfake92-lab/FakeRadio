import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGrokTtsAdapter } from "./grok-tts-adapter.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "grok-tts-test-"));
}

describe("createGrokTtsAdapter", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTmpDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("calls xAI TTS API with official request format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createGrokTtsAdapter({ apiKey: "test-key", cacheDir });
    await adapter.synthesize("你好世界");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/tts");
    expect(opts.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(opts.body);
    expect(body.text).toBe("你好世界");
    expect(body.voice_id).toBe("eve");
    expect(body.language).toBe("zh");
    expect(body.speed).toBe(1);
    expect(body.output_format).toEqual({ codec: "mp3" });
  });

  it("wraps text with official speech tag when style is selected", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createGrokTtsAdapter({ apiKey: "test-key", cacheDir, style: "whisper" });
    await adapter.synthesize("秘密片段");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toBe("<whisper>秘密片段</whisper>");
  });

  it("clamps speed to xAI supported range", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createGrokTtsAdapter({ apiKey: "test-key", cacheDir, speed: 2 });
    await adapter.synthesize("快一点");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.speed).toBe(1.5);
  });

  it("saves raw audio bytes to cache and reuses cache on second call", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("cached-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createGrokTtsAdapter({ apiKey: "test-key", cacheDir, voice: "ara" });
    const first = await adapter.synthesize("缓存测试");
    const second = await adapter.synthesize("缓存测试");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(first.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.mp3$/);
    expect(second.cacheKey).toBe(first.cacheKey);
    const saved = readFileSync(join(cacheDir, `${first.cacheKey}.mp3`));
    expect(saved.byteLength).toBeGreaterThan(0);
  });

  it("different voices and styles produce different cache keys", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter1 = createGrokTtsAdapter({ apiKey: "test-key", cacheDir, voice: "eve", style: "soft" });
    const adapter2 = createGrokTtsAdapter({ apiKey: "test-key", cacheDir, voice: "leo", style: "emphasis" });

    const r1 = await adapter1.synthesize("同一句话");
    const r2 = await adapter2.synthesize("同一句话");

    expect(r1.cacheKey).not.toBe(r2.cacheKey);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws on API error", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized")
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createGrokTtsAdapter({ apiKey: "bad-key", cacheDir });
    await expect(adapter.synthesize("测试")).rejects.toThrow("Grok TTS API error 401");
  });
});
