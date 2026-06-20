import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMacOsSayTtsAdapter } from "./macos-say-tts-adapter.js";

describe("createMacOsSayTtsAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "macos-say-tts-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses macOS say to generate an m4a cache file", async () => {
    const execFile = vi.fn().mockResolvedValue(undefined);
    const adapter = createMacOsSayTtsAdapter({
      cacheDir: tempDir,
      baseUrl: "/test-cache",
      voice: "Tingting",
      execFile
    });

    const result = await adapter.synthesize("测试本地语音");

    expect(result.audioUrl).toMatch(/^\/test-cache\/[a-f0-9]{16}\.m4a$/);
    expect(execFile).toHaveBeenCalledOnce();
    const [command, args] = execFile.mock.calls[0];
    expect(command).toBe("say");
    expect(args).toEqual(["-v", "Tingting", "-o", expect.stringMatching(/\.m4a$/), "--file-format=m4af", "测试本地语音"]);
  });

  it("returns cached m4a without invoking say", async () => {
    const execFile = vi.fn().mockResolvedValue(undefined);
    const adapter = createMacOsSayTtsAdapter({ cacheDir: tempDir, baseUrl: "/test-cache", execFile });
    const first = await adapter.synthesize("缓存命中");
    const filename = first.audioUrl.replace("/test-cache/", "");
    writeFileSync(join(tempDir, filename), Buffer.from("cached m4a"));

    execFile.mockClear();
    const second = await adapter.synthesize("缓存命中");

    expect(second.audioUrl).toBe(first.audioUrl);
    expect(execFile).not.toHaveBeenCalled();
  });
});
