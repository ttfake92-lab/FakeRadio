import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockTtsAdapter } from "./mock-tts-adapter.js";
import { hashText } from "./tts-cache-manager.js";

describe("createMockTtsAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mock-tts-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // May have been cleaned up by the write-failure test
      try { rmSync(tempDir, { force: true }); } catch {}
    }
  });

  it("generates a real silence audio file and returns a valid cache URL", async () => {
    const text = "Hello, this is a mock TTS test.";
    const expectedCacheKey = hashText(text);

    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    const result = await adapter.synthesize(text);

    expect(result.text).toBe(text);
    expect(result.cacheKey).toBe(expectedCacheKey);
    expect(result.audioUrl).toBe(`/cache/tts/${expectedCacheKey}.wav`);

    // Verify the file actually exists on disk
    const filePath = join(tempDir, `${expectedCacheKey}.wav`);
    expect(existsSync(filePath)).toBe(true);
  });

  it("returns cached result on subsequent calls without rewriting", async () => {
    const text = "Cached text.";

    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    const first = await adapter.synthesize(text);
    const second = await adapter.synthesize(text);

    expect(second.audioUrl).toBe(first.audioUrl);
    expect(second.cacheKey).toBe(first.cacheKey);
  });

  it("returns sentinel URL when cacheDir is not provided", async () => {
    const adapter = createMockTtsAdapter();

    const result = await adapter.synthesize("test");

    expect(result.text).toBe("test");
    expect(result.audioUrl).toBe("/cache/tts/mock-sentinel.wav");
    expect(result.cacheKey).toBe("mock-sentinel");
  });

  it("returns sentinel URL on write failure", async () => {
    // Replace tempDir with a plain file so mkdirSync fails
    rmSync(tempDir, { recursive: true, force: true });
    writeFileSync(tempDir, "");

    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    // Need to clean up the file we created before assertions
    // so afterEach rmSync won't fail on a non-directory
    try {
      const result = await adapter.synthesize("Write failure test");
      expect(result.audioUrl).toBe("/cache/tts/mock-sentinel.wav");
      expect(result.cacheKey).toBe("mock-sentinel");
    } finally {
      rmSync(tempDir, { force: true });
    }
  });
});

describe("generateSilenceWav (via createMockTtsAdapter)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mock-tts-wav-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("produces a valid WAV file with RIFF header", async () => {
    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    const result = await adapter.synthesize("RIFF header test");
    const filePath = join(tempDir, `${result.cacheKey}.wav`);

    const { readFileSync } = await import("node:fs");
    const buffer = readFileSync(filePath);

    // Check RIFF header
    expect(buffer.slice(0, 4).toString()).toBe("RIFF");
    // Check WAVE format
    expect(buffer.slice(8, 12).toString()).toBe("WAVE");
    // Check fmt chunk marker
    expect(buffer.slice(12, 16).toString()).toBe("fmt ");

    // Verify PCM format (1)
    expect(buffer.readUInt16LE(20)).toBe(1);
    // Verify mono (1 channel)
    expect(buffer.readUInt16LE(22)).toBe(1);
    // Verify 16-bit
    expect(buffer.readUInt16LE(34)).toBe(16);
    // Verify 22050 Hz sample rate
    expect(buffer.readUInt32LE(24)).toBe(22050);

    // Check data chunk marker
    expect(buffer.slice(36, 40).toString()).toBe("data");

    // Verify file size matches RIFF header claim
    const expectedSize = buffer.length;
    expect(buffer.readUInt32LE(4) + 8).toBe(expectedSize);
  });

  it("generates approximately 500ms of silence", async () => {
    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    const result = await adapter.synthesize("Duration test");
    const filePath = join(tempDir, `${result.cacheKey}.wav`);

    const { readFileSync } = await import("node:fs");
    const buffer = readFileSync(filePath);

    const dataSize = buffer.readUInt32LE(40);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    const numChannels = buffer.readUInt16LE(22);

    const expectedSamples = sampleRate * (500 / 1000);
    const actualSamples = dataSize / (numChannels * bitsPerSample / 8);

    // Allow ~1ms tolerance
    expect(Math.abs(actualSamples - expectedSamples)).toBeLessThan(50);
  });

  it("all PCM samples are zero (silence)", async () => {
    const adapter = createMockTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/cache/tts"
    });

    const result = await adapter.synthesize("Silence check");
    const filePath = join(tempDir, `${result.cacheKey}.wav`);

    const { readFileSync } = await import("node:fs");
    const buffer = readFileSync(filePath);

    // Data starts at byte 44 (after WAV header)
    const pcmData = buffer.slice(44);
    // Every 16-bit sample should be 0
    for (let i = 0; i < pcmData.length; i += 2) {
      expect(pcmData.readInt16LE(i)).toBe(0);
    }
  });
});
