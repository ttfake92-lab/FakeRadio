import { tts } from "edge-tts";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager, hashText } from "./tts-cache-manager.js";

export type CreateEdgeTtsAdapterOptions = {
  cacheDir: string;
  voice?: string;
  baseUrl?: string;
};

export function createEdgeTtsAdapter(options: CreateEdgeTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const voice = options.voice ?? "zh-CN-XiaoxiaoNeural";
  const baseUrl = options.baseUrl ?? "/cache/tts";

  return {
    async synthesize(text) {
      const cacheKey = hashText(text);

      if (await cacheManager.exists(cacheKey)) {
        return {
          text,
          audioUrl: `${baseUrl}/${cacheKey}.mp3`,
          cacheKey
        };
      }

      const buffer = await tts(text, { voice });
      await cacheManager.save(cacheKey, buffer);

      return {
        text,
        audioUrl: `${baseUrl}/${cacheKey}.mp3`,
        cacheKey
      };
    }
  };
}
