import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager, hashText } from "./tts-cache-manager.js";

export type CreateMockTtsAdapterOptions = {
  cacheDir?: string;
  baseUrl?: string;
};

function generateSilenceWav(durationMs: number): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // PCM samples already zero (silence)

  return buffer;
}

export function createMockTtsAdapter(options: CreateMockTtsAdapterOptions = {}): TtsAdapter {
  const cacheDir = options.cacheDir;
  const baseUrl = options.baseUrl ?? "/cache/tts";
  const cacheManager = cacheDir ? createTtsCacheManager(cacheDir) : null;

  return {
    async synthesize(text) {
      const cacheKey = hashText(text);

      if (cacheManager) {
        try {
          if (cacheManager.exists(cacheKey)) {
            return {
              text,
              audioUrl: `${baseUrl}/${cacheKey}.mp3`,
              cacheKey
            };
          }

          const silenceBuffer = generateSilenceWav(500);
          cacheManager.save(cacheKey, silenceBuffer);

          return {
            text,
            audioUrl: `${baseUrl}/${cacheKey}.mp3`,
            cacheKey
          };
        } catch {
          // Fall through to sentinel on write failure
        }
      }

      // Sentinel: cacheDir unavailable or write failed
      return {
        text,
        audioUrl: "/cache/tts/mock-sentinel.mp3",
        cacheKey: "mock-sentinel"
      };
    }
  };
}
