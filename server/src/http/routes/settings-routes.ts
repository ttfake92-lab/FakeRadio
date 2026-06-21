import { z } from "zod";
import { SettingsSchema, SettingsResponseSchema, UpdateSettingsRequestSchema } from "@fakeradio/shared";
import type { FastifyInstance } from "fastify";
import type { StateRepository } from "../../state/state-repository.js";
import type { RuntimeAdapterManager } from "../runtime-adapter-manager.js";
import type { Settings } from "@fakeradio/shared";
import { env } from "../../config/env.js";
import { createMimoTtsAdapter } from "../../adapters/tts/mimo-tts-adapter.js";
import { createEdgeTtsAdapter } from "../../adapters/tts/edge-tts-adapter.js";

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

const EDGE_VOICES = [
  { value: "zh-CN-XiaoxiaoNeural", label: "晓晓 · 中文女声" },
  { value: "zh-CN-YunxiNeural", label: "云希 · 中文男声" },
  { value: "zh-CN-YunyangNeural", label: "云扬 · 中文男声(新闻)" },
  { value: "zh-CN-XiaoyiNeural", label: "晓伊 · 中文女声(活泼)" },
  { value: "zh-CN-YunjianNeural", label: "云健 · 中文男声(体育)" },
  { value: "zh-CN-liaoning-XiaobeiNeural", label: "晓北 · 东北女声" },
  { value: "en-US-JennyNeural", label: "Jenny · 英文女声" },
  { value: "en-US-GuyNeural", label: "Guy · 英文男声" }
];

const TtsPreviewRequestSchema = z.object({
  text: z.string().optional(),
  provider: z.enum(["mimo", "edge"]),
  voice: z.string().min(1),
  style: z.string().optional(),
  rate: z.number().int().min(-50).max(200).optional()
});

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
    return reply.send({ mimo: MIMO_VOICES, edge: EDGE_VOICES });
  });

  app.post("/api/tts/preview", async (request, reply) => {
    const body = TtsPreviewRequestSchema.parse(request.body);
    const text = body.text?.trim() || "欢迎收听 FakeRadio，这是当前音色的试听。";
    if (body.provider === "mimo" && !env.FAKERADIO_MIMO_API_KEY) {
      return reply.status(503).send({ error: "未配置 MiMo API key，无法试听" });
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
        : createEdgeTtsAdapter({
            cacheDir: ttsCacheDir,
            voice: body.voice,
            ...(body.rate !== undefined ? { rate: body.rate } : {})
          });
      const result = await adapter.synthesize(text);
      return reply.send({ audioUrl: result.audioUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "试听生成失败";
      return reply.status(503).send({ error: message });
    }
  });
}
