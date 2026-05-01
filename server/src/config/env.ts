import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  FAKERADIO_PROVIDER_MODE: z.enum(["auto", "mock", "netease"]).default("auto"),
  FAKERADIO_NETEASE_API_BASE_URL: z.string().url().default("http://127.0.0.1:3300"),
  FAKERADIO_NETEASE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  FAKERADIO_TTS_VOICE: z.string().min(1).default("zh-CN-XiaoxiaoNeural"),
  FAKERADIO_TTS_CACHE_DIR: z.string().min(1).default("cache/tts")
});

export function parseEnv(input: Record<string, string | undefined>) {
  return EnvSchema.parse(input);
}

export const env = parseEnv(process.env);
