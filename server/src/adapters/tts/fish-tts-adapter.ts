import { createHash } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { TtsAdapter } from "../types.js";
import { createTtsCacheManager } from "./tts-cache-manager.js";

export type CreateFishTtsAdapterOptions = {
  apiKey: string;
  cacheDir: string;
  /** Fish Audio voice model ID（fish.audio 音色页面复制），作为 reference_id 传给 API */
  voiceId: string;
  baseUrl?: string;
  /** TTS 模型，s1 或 s2-pro */
  model?: string;
  speed?: number;
  style?: string;
  timeoutMs?: number;
  /** 显式覆盖 HTTPS 代理;不传则按 FAKERADIO_FISH_HTTPS_PROXY → HTTPS_PROXY → HTTP_PROXY → ALL_PROXY 顺序探测 */
  httpsProxy?: string;
};

function clampSpeed(speed: number): number {
  // Fish Audio prosody.speed 支持 0.5–2
  return Math.min(2, Math.max(0.5, speed));
}

function applySpeechStyle(text: string, style: string): string {
  // s2-pro 支持在文本内用自由格式 [bracket] 自然语言标签控制表达,
  // 例如 [温柔治愈] 或 [slightly sarcastic, rising tone]
  const trimmed = style.trim();
  return trimmed ? `[${trimmed}] ${text}` : text;
}

function hashFishPayload(text: string, model: string, voiceId: string, speed: number, style: string): string {
  return createHash("sha256")
    .update(`fish:${model}:${voiceId}:${speed}:${style}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

function resolveProxyUrl(override: string | undefined): string | undefined {
  // 与 grok adapter 同理:Node 的 fetch (undici) 不会自动读 HTTPS_PROXY,
  // 有代理环境必须显式传 dispatcher,否则境内直连 api.fish.audio 可能超时。
  const env = process.env;
  const candidate =
    override ??
    env.FAKERADIO_FISH_HTTPS_PROXY ??
    env.HTTPS_PROXY ?? env.https_proxy ??
    env.HTTP_PROXY ?? env.http_proxy ??
    env.ALL_PROXY ?? env.all_proxy;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function createFishTtsAdapter(options: CreateFishTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const baseUrl = (options.baseUrl ?? "https://api.fish.audio").replace(/\/$/, "");
  const model = options.model ?? "s2-pro";
  const voiceId = options.voiceId.trim();
  const speed = clampSpeed(options.speed ?? 1);
  const style = options.style?.trim() ?? "";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const proxyUrl = resolveProxyUrl(options.httpsProxy);
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  console.log(`[fish-tts] init: model=${model} voiceId=${voiceId} speed=${speed} proxy=${proxyUrl ?? "(direct)"} style=${style || "(none)"}`);

  return {
    async synthesize(text) {
      const cacheKey = hashFishPayload(text, model, voiceId, speed, style);

      if (await cacheManager.exists(cacheKey, "mp3")) {
        return { text, audioUrl: `/cache/tts/${cacheKey}.mp3`, cacheKey };
      }

      let response: Awaited<ReturnType<typeof undiciFetch>> | Response;
      try {
        // 有代理时必须用 undici 的 fetch + ProxyAgent dispatcher(内置 globalThis.fetch
        // 与外部 undici@7 ProxyAgent 不兼容);没代理时用 globalThis.fetch 便于单测 stub。
        const fetchFn = dispatcher ? undiciFetch : fetch;
        const init: Parameters<typeof undiciFetch>[1] = {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            model
          },
          body: JSON.stringify({
            text: applySpeechStyle(text, style),
            reference_id: voiceId,
            format: "mp3",
            mp3_bitrate: 128,
            latency: "normal",
            prosody: { speed }
          }),
          signal: AbortSignal.timeout(timeoutMs),
          ...(dispatcher ? { dispatcher } : {})
        };
        response = await (fetchFn as typeof undiciFetch)(`${baseUrl}/v1/tts`, init);
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`Fish Audio TTS 生成超时（${Math.round(timeoutMs / 1000)}s），请重试`);
        }
        throw err;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Fish Audio TTS API error ${response.status}: ${body}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (audioBuffer.byteLength === 0) {
        throw new Error("Fish Audio TTS API returned empty audio data");
      }

      await cacheManager.save(cacheKey, audioBuffer, "mp3");

      return { text, audioUrl: `/cache/tts/${cacheKey}.mp3`, cacheKey };
    }
  };
}
