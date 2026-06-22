import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: resolve(fileURLToPath(import.meta.url), "../../../../.env") });

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3301),
  FAKERADIO_PROVIDER_MODE: z.enum(["netease"]).default("netease"),
  FAKERADIO_NETEASE_API_BASE_URL: z.string().url().default("http://127.0.0.1:3300"),
  FAKERADIO_NETEASE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  FAKERADIO_NETEASE_COOKIE_FILE: z.string().min(1).default("user/secrets/netease-cookie.txt"),
  FAKERADIO_NETEASE_AUDIO_LEVEL: z.enum(["standard", "higher", "exhigh", "lossless", "hires"]).default("exhigh"),
  FAKERADIO_TTS_PROVIDER: z.enum(["grok", "mimo"]).default("grok"),
  FAKERADIO_TTS_VOICE: z.string().min(1).default("eve"),
  FAKERADIO_TTS_CACHE_DIR: z.string().min(1).default("cache/tts"),
  XAI_API_KEY: z.string().optional(),
  FAKERADIO_XAI_API_KEY: z.string().optional(),
  FAKERADIO_XAI_TTS_BASE_URL: z.string().url().default("https://api.x.ai/v1"),
  FAKERADIO_XAI_TTS_LANGUAGE: z.string().min(1).default("zh"),
  FAKERADIO_XAI_TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  FAKERADIO_MIMO_API_KEY: z.string().optional(),
  FAKERADIO_MIMO_BASE_URL: z.string().url().default("https://api.xiaomimimo.com/v1"),
  FAKERADIO_MIMO_TTS_VOICE: z.string().min(1).default("茉莉"),
  FAKERADIO_MIMO_TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  FAKERADIO_BRAVE_API_KEY: z.string().optional(),
  FAKERADIO_DEEPSEEK_API_KEY: z.string().optional(),
  FAKERADIO_DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
  FAKERADIO_DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  FAKERADIO_PREWARM_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FAKERADIO_PREWARM_TIME: z.string().min(1).default("23:30"),
  FAKERADIO_PREWARM_EPISODES_PER_BLOCK: z.coerce.number().int().positive().default(3),
  // 启动时为当前 block 预生成多少首完整 episode（含口播 TTS）。后台异步生成，
  // 不阻塞启动和首次播放。每首约 5-15s LLM+TTS，10 首约 1-2 分钟陆续就绪。
  FAKERADIO_PREWARM_STARTUP_EPISODES: z.coerce.number().int().positive().default(10),
  // prepared_episodes 的低水位：当前 block 剩余 ready 数低于此值时触发后台补生成。
  FAKERADIO_PREWARM_LOW_WATER_MARK: z.coerce.number().int().positive().default(2),
  FAKERADIO_OPENWEATHER_API_KEY: z.string().optional(),
  FAKERADIO_WEATHER_CITY: z.string().min(1).default("Shanghai"),
  FAKERADIO_LARK_CALENDAR_CLIENT_ID: z.string().optional(),
  FAKERADIO_LARK_CALENDAR_CLIENT_SECRET: z.string().optional()
});

export function parseEnv(input: Record<string, string | undefined>) {
  return EnvSchema.parse(input);
}

export const env = parseEnv(process.env);
