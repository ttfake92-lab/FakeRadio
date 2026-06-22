import { z } from "zod";
import { SettingsSchema, SettingsResponseSchema, UpdateSettingsRequestSchema } from "@fakeradio/shared";
import type { FastifyInstance } from "fastify";
import type { StateRepository } from "../../state/state-repository.js";
import type { RuntimeAdapterManager } from "../runtime-adapter-manager.js";
import type { Settings } from "@fakeradio/shared";
import { env } from "../../config/env.js";
import { createMimoTtsAdapter } from "../../adapters/tts/mimo-tts-adapter.js";
import { createGrokTtsAdapter } from "../../adapters/tts/grok-tts-adapter.js";

const MIMO_VOICES = [
  { value: "茉莉", label: "茉莉 · 中文女声" },
  { value: "冰糖", label: "冰糖 · 中文女声" },
  { value: "苏打", label: "苏打 · 中文男声" },
  { value: "白桦", label: "白桦 · 中文男声" },
  { value: "Mia", label: "Mia · 英文女声" },
  { value: "Chloe", label: "Chloe · 英文女声" },
  { value: "Milo", label: "Milo · 英文男声" },
  { value: "Dean", label: "Dean · 英文男声" },
  { value: "mimo_default", label: "mimo_default" },
  { value: "default_zh", label: "default_zh" },
  { value: "default_en", label: "default_en" }
];

const GROK_VOICES = [
  { value: "eve", label: "Eve · 活力、明亮" },
  { value: "ara", label: "Ara · 温暖、友好" },
  { value: "rex", label: "Rex · 清晰、专业" },
  { value: "sal", label: "Sal · 平衡、顺滑" },
  { value: "leo", label: "Leo · 权威、有力" }
];

const GROK_STYLES = [
  { value: "", label: "自然" },
  { value: "soft", label: "轻柔 <soft>" },
  { value: "whisper", label: "耳语 <whisper>" },
  { value: "emphasis", label: "强调 <emphasis>" },
  { value: "slow", label: "慢速 <slow>" },
  { value: "fast", label: "快速 <fast>" },
  { value: "laugh-speak", label: "带笑意 <laugh-speak>" },
  { value: "sing-song", label: "吟唱感 <sing-song>" }
];

const TtsPreviewRequestSchema = z.object({
  text: z.string().optional(),
  provider: z.enum(["mimo", "grok"]),
  voice: z.string().min(1),
  style: z.string().optional(),
  rate: z.number().int().min(-50).max(200).optional()
});

function getXaiApiKey() {
  return env.FAKERADIO_XAI_API_KEY ?? env.XAI_API_KEY;
}

function rateToGrokSpeed(rate: number | undefined): number {
  return Math.min(1.5, Math.max(0.7, 1 + (rate ?? 0) / 100));
}

type SettingsRouteDeps = {
  app: FastifyInstance;
  stateRepo: StateRepository;
  runtimeManager: RuntimeAdapterManager | undefined;
  ttsCacheDir: string;
};

export function registerSettingsRoutes(deps: SettingsRouteDeps) {
  const { app, stateRepo, runtimeManager, ttsCacheDir } = deps;

  app.get("/api/settings", async (_request, reply) => {
    return reply.send(SettingsResponseSchema.parse({
      settings: runtimeManager?.getSettings() ?? SettingsSchema.parse({})
    }));
  });

  app.put("/api/settings", async (request, reply) => {
    const body = UpdateSettingsRequestSchema.parse(request.body);
    const currentSettings = runtimeManager?.getSettings() ?? await stateRepo.getPref<Settings>("show:settings") ?? {};
    const mergedSettings = SettingsSchema.parse({
      ...currentSettings,
      ...body
    });
    if (runtimeManager) {
      try {
        await runtimeManager.applySettings(mergedSettings);
      } catch (err) {
        const message = err instanceof Error ? err.message : "设置应用失败";
        return reply.status(503).send({ error: message });
      }
    }
    await stateRepo.upsertPref("show:settings", mergedSettings);
    return reply.send(SettingsResponseSchema.parse({ settings: mergedSettings }));
  });

  app.get("/api/tts/voices", async (_request, reply) => {
    return reply.send({ mimo: MIMO_VOICES, grok: GROK_VOICES, grokStyles: GROK_STYLES });
  });

  app.post("/api/tts/preview", async (request, reply) => {
    const body = TtsPreviewRequestSchema.parse(request.body);
    const text = body.text?.trim() || "欢迎收听 FakeRadio，这是当前音色的试听。";
    if (body.provider === "mimo" && !env.FAKERADIO_MIMO_API_KEY) {
      return reply.status(503).send({ error: "未配置 MiMo API key，无法试听" });
    }
    const xaiApiKey = getXaiApiKey();
    if (body.provider === "grok" && !xaiApiKey) {
      return reply.status(503).send({ error: "未配置 xAI API key，无法试听 Grok TTS" });
    }
    try {
      const adapter = body.provider === "mimo"
        ? createMimoTtsAdapter({
            apiKey: env.FAKERADIO_MIMO_API_KEY ?? "",
            cacheDir: ttsCacheDir,
            baseUrl: env.FAKERADIO_MIMO_BASE_URL,
            voice: body.voice,
            ...(body.style !== undefined ? { style: body.style } : {}),
            timeoutMs: env.FAKERADIO_MIMO_TTS_TIMEOUT_MS
          })
        : createGrokTtsAdapter({
            apiKey: xaiApiKey ?? "",
            cacheDir: ttsCacheDir,
            baseUrl: env.FAKERADIO_XAI_TTS_BASE_URL,
            voice: body.voice,
            language: env.FAKERADIO_XAI_TTS_LANGUAGE,
            speed: rateToGrokSpeed(body.rate),
            ...(body.style !== undefined ? { style: body.style } : {}),
            timeoutMs: env.FAKERADIO_XAI_TTS_TIMEOUT_MS
          });
      const result = await adapter.synthesize(text);
      return reply.send({ audioUrl: result.audioUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "试听生成失败";
      return reply.status(503).send({ error: message });
    }
  });
}
