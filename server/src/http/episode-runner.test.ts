import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { synthesizeWithFallback } from "./episode-runner.js";
import type { TtsAdapter } from "../adapters/types.js";

describe("synthesizeWithFallback", () => {
  it("uses an audible local fallback when primary TTS fails", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "episode-runner-tts-test-"));
    const primary: TtsAdapter = {
      async synthesize() {
        throw new Error("primary down");
      }
    };
    const audibleFallback: TtsAdapter = {
      async synthesize(text) {
        return { text, audioUrl: "/cache/tts/local-fallback.m4a", cacheKey: "local-fallback" };
      }
    };

    try {
      const result = await synthesizeWithFallback(primary, cacheDir, "测试口播", {
        audibleFallback
      });

      expect(result.result.audioUrl).toBe("/cache/tts/local-fallback.m4a");
      expect(result.fallbackReason).toContain("local audible TTS");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("throws when both primary TTS and local audible fallback fail", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "episode-runner-tts-test-"));
    const primary: TtsAdapter = {
      async synthesize() {
        throw new Error("primary down");
      }
    };
    const audibleFallback: TtsAdapter = {
      async synthesize() {
        throw new Error("local down");
      }
    };

    try {
      await expect(
        synthesizeWithFallback(primary, cacheDir, "测试口播", {
          audibleFallback
        })
      ).rejects.toThrow("TTS synthesis failed and local audible fallback failed");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
