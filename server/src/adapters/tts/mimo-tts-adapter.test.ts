import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMimoTtsAdapter } from "./mimo-tts-adapter.js";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "mimo-tts-test-"));
}

const audioBase64 = Buffer.from("fake-audio-bytes").toString("base64");

describe("createMimoTtsAdapter", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTmpDir();
    return () => rmSync(cacheDir, { recursive: true, force: true });
  });

  it("calls MiMo API with correct request format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio: { data: audioBase64 } })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "test-key", cacheDir });
    await adapter.synthesize("你好世界");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(opts.headers["api-key"]).toBe("test-key");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("mimo-v2.5-tts");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[1]).toEqual({ role: "assistant", content: "你好世界" });
    expect(body.audio.voice).toBe("茉莉");
    expect(body.audio.format).toBe("wav");

    vi.restoreAllMocks();
  });

  it("uses custom model and voice", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio: { data: audioBase64 } })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({
      apiKey: "test-key",
      cacheDir,
      model: "mimo-v2-tts",
      voice: "冰糖",
      format: "mp3"
    });
    await adapter.synthesize("测试");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.model).toBe("mimo-v2-tts");
    expect(body.audio.voice).toBe("冰糖");
    expect(body.audio.format).toBe("mp3");

    vi.restoreAllMocks();
  });

  it("saves audio to cache and returns correct audioUrl", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio: { data: audioBase64 } })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "test-key", cacheDir });
    const result = await adapter.synthesize("测试缓存");

    expect(result.text).toBe("测试缓存");
    expect(result.audioUrl).toMatch(/^\/cache\/tts\/[a-f0-9]+\.wav$/);
    expect(result.cacheKey).toBeTruthy();

    const saved = readFileSync(join(cacheDir, `${result.cacheKey}.wav`));
    expect(saved.toString()).toBe("fake-audio-bytes");

    vi.restoreAllMocks();
  });

  it("returns cached result on second call without hitting API", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio: { data: audioBase64 } })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "test-key", cacheDir });
    await adapter.synthesize("缓存测试");
    await adapter.synthesize("缓存测试");

    expect(fetchSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("different voices produce different cache keys", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio: { data: audioBase64 } })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter1 = createMimoTtsAdapter({ apiKey: "test-key", cacheDir, voice: "茉莉" });
    const adapter2 = createMimoTtsAdapter({ apiKey: "test-key", cacheDir, voice: "冰糖" });

    const r1 = await adapter1.synthesize("同一句话");
    const r2 = await adapter2.synthesize("同一句话");

    expect(r1.cacheKey).not.toBe(r2.cacheKey);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it("throws on API error", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized")
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "bad-key", cacheDir });
    await expect(adapter.synthesize("测试")).rejects.toThrow("MiMo TTS API error 401");

    vi.restoreAllMocks();
  });

  it("throws when response has no audio data", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "test-key", cacheDir });
    await expect(adapter.synthesize("测试")).rejects.toThrow("no audio data");

    vi.restoreAllMocks();
  });

  it("handles response with audio in choices format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { audio: { data: audioBase64 } } }]
      })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createMimoTtsAdapter({ apiKey: "test-key", cacheDir });
    const result = await adapter.synthesize("嵌套格式");

    expect(result.cacheKey).toBeTruthy();

    vi.restoreAllMocks();
  });
});
