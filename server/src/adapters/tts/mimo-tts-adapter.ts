import { createHash } from "node:crypto";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type CreateMimoTtsAdapterOptions = {
  apiKey: string;
  cacheDir: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
  format?: "wav" | "mp3";
};

function hashTtsPayload(text: string, provider: string, model: string, voice: string): string {
  return createHash("sha256")
    .update(`${provider}:${model}:${voice}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

export function createMimoTtsAdapter(options: CreateMimoTtsAdapterOptions): TtsAdapter {
  const baseUrl = (options.baseUrl ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  const model = options.model ?? "mimo-v2.5-tts";
  const voice = options.voice ?? "茉莉";
  const format = options.format ?? "wav";
  const ext = format === "mp3" ? "mp3" : "wav";
  const cacheManager = createTtsCacheManager(options.cacheDir);

  return {
    async synthesize(text) {
      const cacheKey = hashTtsPayload(text, "mimo", model, voice);

      if (cacheManager.exists(cacheKey, ext)) {
        return { text, audioUrl: `/cache/tts/${cacheKey}.${ext}`, cacheKey };
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": options.apiKey
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "user", content: `Speak in a warm, natural ${voice} voice.` },
            { role: "assistant", content: text }
          ],
          audio: { format, voice }
        })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`MiMo TTS API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        audio?: { data?: string };
        choices?: { message?: { audio?: { data?: string } } }[];
      };

      const audioBase64 = data.audio?.data ?? data.choices?.[0]?.message?.audio?.data;
      if (!audioBase64) {
        throw new Error("MiMo TTS API returned no audio data");
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      cacheManager.save(cacheKey, audioBuffer, ext);

      return { text, audioUrl: `/cache/tts/${cacheKey}.${ext}`, cacheKey };
    }
  };
}
