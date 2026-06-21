import { createHash } from "node:crypto";
import { tts } from "edge-tts";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type CreateEdgeTtsAdapterOptions = {
  cacheDir: string;
  voice?: string;
  rate?: number;
  baseUrl?: string;
};

function formatRate(rate: number): string {
  return rate >= 0 ? `+${rate}%` : `${rate}%`;
}

export function createEdgeTtsAdapter(options: CreateEdgeTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const voice = options.voice ?? "zh-CN-XiaoxiaoNeural";
  const rate = options.rate ?? 0;
  const baseUrl = options.baseUrl ?? "/cache/tts";
  const rateStr = formatRate(rate);

  return {
    async synthesize(text) {
      const cacheKey = createHash("sha256")
        .update(`edge:${voice}:${rate}:${text}`)
        .digest("hex")
        .slice(0, 16);

      if (await cacheManager.exists(cacheKey)) {
        return {
          text,
          audioUrl: `${baseUrl}/${cacheKey}.mp3`,
          cacheKey
        };
      }

      const buffer = await tts(text, { voice, rate: rateStr });
      await cacheManager.save(cacheKey, buffer);

      return {
        text,
        audioUrl: `${baseUrl}/${cacheKey}.mp3`,
        cacheKey
      };
    }
  };
}
