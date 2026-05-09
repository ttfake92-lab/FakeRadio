import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTtsCacheManager, hashText } from "./tts-cache-manager.js";

describe("tts cache manager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tts-cache-test-"));
  });

  afterEach(() => {
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch {}
  });

  it("resolves cache path", () => {
    const manager = createTtsCacheManager(tempDir);
    expect(manager.resolvePath("abc123")).toBe(`${tempDir}/abc123.mp3`);
  });

  it("checks existence", async () => {
    const manager = createTtsCacheManager(tempDir);
    expect(await manager.exists("missing")).toBe(false);
  });

  it("saves and detects cached files", async () => {
    const manager = createTtsCacheManager(tempDir);
    const buffer = Buffer.from("fake mp3 data");

    await manager.save("mykey", buffer);

    expect(await manager.exists("mykey")).toBe(true);
    expect(manager.resolvePath("mykey")).toBe(`${tempDir}/mykey.mp3`);
  });
});

describe("hashText", () => {
  it("returns a stable short hash", () => {
    const hash1 = hashText("hello world");
    const hash2 = hashText("hello world");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
  });

  it("returns different hashes for different texts", () => {
    const hash1 = hashText("hello");
    const hash2 = hashText("world");
    expect(hash1).not.toBe(hash2);
  });
});
