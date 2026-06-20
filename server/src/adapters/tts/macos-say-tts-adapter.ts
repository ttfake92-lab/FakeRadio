import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type MacOsSayExecFile = (file: string, args: string[]) => Promise<unknown>;

export type CreateMacOsSayTtsAdapterOptions = {
  cacheDir: string;
  baseUrl?: string;
  voice?: string;
  sayCommand?: string;
  execFile?: MacOsSayExecFile;
};

function hashMacOsSayPayload(text: string, voice: string): string {
  return createHash("sha256")
    .update(`macos-say:${voice}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

export function createMacOsSayTtsAdapter(options: CreateMacOsSayTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const baseUrl = options.baseUrl ?? "/cache/tts";
  const voice = options.voice ?? "Tingting";
  const sayCommand = options.sayCommand ?? "say";
  const execFile = options.execFile ?? promisify(execFileCallback);

  return {
    async synthesize(text) {
      const cacheKey = hashMacOsSayPayload(text, voice);
      const ext = "m4a";

      if (await cacheManager.exists(cacheKey, ext)) {
        return { text, audioUrl: `${baseUrl}/${cacheKey}.${ext}`, cacheKey };
      }

      const outputPath = cacheManager.resolvePath(cacheKey, ext);
      await mkdir(dirname(outputPath), { recursive: true });
      await execFile(sayCommand, ["-v", voice, "-o", outputPath, "--file-format=m4af", text]);

      return { text, audioUrl: `${baseUrl}/${cacheKey}.${ext}`, cacheKey };
    }
  };
}
