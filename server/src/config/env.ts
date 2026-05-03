import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: resolve(fileURLToPath(import.meta.url), "../../../../.env") });

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3301),
  FAKERADIO_PROVIDER_MODE: z.enum(["auto", "mock", "netease"]).default("auto"),
  FAKERADIO_NETEASE_API_BASE_URL: z.string().url().default("http://127.0.0.1:3300"),
  FAKERADIO_NETEASE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  FAKERADIO_TTS_PROVIDER: z.enum(["edge", "mimo"]).default("edge"),
  FAKERADIO_TTS_VOICE: z.string().min(1).default("zh-CN-XiaoxiaoNeural"),
  FAKERADIO_TTS_CACHE_DIR: z.string().min(1).default("cache/tts"),
  FAKERADIO_MIMO_API_KEY: z.string().optional(),
  FAKERADIO_MIMO_BASE_URL: z.string().url().default("https://api.xiaomimimo.com/v1"),
  FAKERADIO_MIMO_TTS_VOICE: z.string().min(1).default("茉莉"),
  FAKERADIO_BRAVE_API_KEY: z.string().optional(),
  FAKERADIO_DEEPSEEK_API_KEY: z.string().optional(),
  FAKERADIO_DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-flash"),
  FAKERADIO_DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com/v1")
});

export function parseEnv(input: Record<string, string | undefined>) {
  return EnvSchema.parse(input);
}

export const env = parseEnv(process.env);
