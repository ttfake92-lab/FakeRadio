import { createHash } from "node:crypto";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type CreateMimoTtsAdapterOptions = {
  apiKey: string;
  cacheDir: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
  style?: string;
  format?: "wav" | "mp3";
  timeoutMs?: number;
};

function hashTtsPayload(text: string, provider: string, model: string, voice: string, style: string): string {
  return createHash("sha256")
    .update(`${provider}:${model}:${voice}:${style}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

export function createMimoTtsAdapter(options: CreateMimoTtsAdapterOptions): TtsAdapter {
  const baseUrl = (options.baseUrl ?? "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  const model = options.model ?? "mimo-v2.5-tts";
  const voice = options.voice ?? "茉莉";
  const style = options.style?.trim() ?? "";
  const format = options.format ?? "wav";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const ext = format === "mp3" ? "mp3" : "wav";
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const stylePrompt = style
    ? `以${style}的风格、用${voice}音色朗读以下内容。`
    : `Speak in a warm, natural ${voice} voice.`;

  return {
    async synthesize(text) {
      const cacheKey = hashTtsPayload(text, "mimo", model, voice, style);

      if (await cacheManager.exists(cacheKey, ext)) {
        return { text, audioUrl: `/cache/tts/${cacheKey}.${ext}`, cacheKey };
      }

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": options.apiKey
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "user", content: stylePrompt },
              { role: "assistant", content: text }
            ],
            audio: { format, voice }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`TTS 生成超时（${Math.round(timeoutMs / 1000)}s），请重试`);
        }
        throw err;
      }

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
      await cacheManager.save(cacheKey, audioBuffer, ext);

      return { text, audioUrl: `/cache/tts/${cacheKey}.${ext}`, cacheKey };
    }
  };
}
