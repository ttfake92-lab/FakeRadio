import { createHash } from "node:crypto";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type CreateGrokTtsAdapterOptions = {
  apiKey: string;
  cacheDir: string;
  baseUrl?: string;
  voice?: string;
  language?: string;
  speed?: number;
  style?: string;
  timeoutMs?: number;
};

const GROK_STYLE_TAGS: Record<string, string> = {
  soft: "soft",
  whisper: "whisper",
  loud: "loud",
  emphasis: "emphasis",
  slow: "slow",
  fast: "fast",
  "laugh-speak": "laugh-speak",
  "sing-song": "sing-song"
};

function clampSpeed(speed: number): number {
  return Math.min(1.5, Math.max(0.7, speed));
}

function getSpeechStyleTag(style: string): string {
  return GROK_STYLE_TAGS[style.trim()] ?? "";
}

function applySpeechStyle(text: string, style: string): string {
  const tag = getSpeechStyleTag(style);
  return tag ? `<${tag}>${text}</${tag}>` : text;
}

function hashGrokPayload(text: string, voice: string, language: string, speed: number, style: string): string {
  return createHash("sha256")
    .update(`grok:${voice}:${language}:${speed}:${style}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

export function createGrokTtsAdapter(options: CreateGrokTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const baseUrl = (options.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const voice = options.voice ?? "eve";
  const language = options.language ?? "zh";
  const speed = clampSpeed(options.speed ?? 1);
  const style = getSpeechStyleTag(options.style ?? "");
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    async synthesize(text) {
      const cacheKey = hashGrokPayload(text, voice, language, speed, style);

      if (await cacheManager.exists(cacheKey, "mp3")) {
        return { text, audioUrl: `/cache/tts/${cacheKey}.mp3`, cacheKey };
      }

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/tts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: applySpeechStyle(text, style),
            voice_id: voice,
            language,
            speed,
            output_format: {
              codec: "mp3"
            }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`Grok TTS 生成超时（${Math.round(timeoutMs / 1000)}s），请重试`);
        }
        throw err;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Grok TTS API error ${response.status}: ${body}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (audioBuffer.byteLength === 0) {
        throw new Error("Grok TTS API returned empty audio data");
      }

      await cacheManager.save(cacheKey, audioBuffer, "mp3");

      return { text, audioUrl: `/cache/tts/${cacheKey}.mp3`, cacheKey };
    }
  };
}
