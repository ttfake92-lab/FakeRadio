import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFishTtsAdapter } from "./fish-tts-adapter.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "fish-tts-test-"));
}

describe("createFishTtsAdapter", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTmpDir();
    // 测试环境可能继承 shell 的 HTTPS_PROXY,导致 adapter 走 undiciFetch
    // 绕过 globalThis.fetch stub。显式清掉,让测试走 stub 路径。
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    delete process.env.https_proxy;
    delete process.env.http_proxy;
    delete process.env.all_proxy;
    delete process.env.FAKERADIO_FISH_HTTPS_PROXY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("calls Fish Audio TTS API with official request format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123" });
    await adapter.synthesize("你好世界");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect(opts.headers.Authorization).toBe("Bearer test-key");
    expect(opts.headers.model).toBe("s2-pro");

    const body = JSON.parse(opts.body);
    expect(body.text).toBe("你好世界");
    expect(body.reference_id).toBe("abc123");
    expect(body.format).toBe("mp3");
    expect(body.prosody).toEqual({ speed: 1 });
  });

  it("prepends bracket style tag when style is set", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123", style: "温柔治愈" });
    await adapter.synthesize("晚上好");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toBe("[温柔治愈] 晚上好");
  });

  it("clamps speed to Fish Audio supported range", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123", speed: 3 });
    await adapter.synthesize("快一点");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.prosody.speed).toBe(2);
  });

  it("saves raw audio bytes to cache and reuses cache on second call", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("cached-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123" });
    const first = await adapter.synthesize("缓存测试");
    const second = await adapter.synthesize("缓存测试");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(first.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]{16}\.mp3$/);
    expect(second.cacheKey).toBe(first.cacheKey);
    const saved = readFileSync(join(cacheDir, `${first.cacheKey}.mp3`));
    expect(saved.byteLength).toBeGreaterThan(0);
  });

  it("different voice IDs produce different cache keys", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("fake-audio").buffer)
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter1 = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "voice-a" });
    const adapter2 = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "voice-b" });

    const r1 = await adapter1.synthesize("同一句话");
    const r2 = await adapter2.synthesize("同一句话");

    expect(r1.cacheKey).not.toBe(r2.cacheKey);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws on API error", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: () => Promise.resolve("Out of credit")
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123" });
    await expect(adapter.synthesize("测试")).rejects.toThrow("Fish Audio TTS API error 402");
  });

  it("throws on empty audio response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createFishTtsAdapter({ apiKey: "test-key", cacheDir, voiceId: "abc123" });
    await expect(adapter.synthesize("测试")).rejects.toThrow("Fish Audio TTS API returned empty audio data");
  });
});
