import { createHash } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";
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
  /** 显式覆盖 HTTPS 代理;不传则按 FAKERADIO_GROK_HTTPS_PROXY → HTTPS_PROXY → HTTP_PROXY → ALL_PROXY 顺序探测 */
  httpsProxy?: string;
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

function resolveProxyUrl(override: string | undefined): string | undefined {
  // 显式 override 优先,否则用系统级代理变量。api.x.ai 在某些网络环境(如境内)
  // 直连会超时——其 IP 解析到 Meta CDN,可能被墙。Node 的 fetch (undici)
  // 不会像 curl 那样自动读 HTTPS_PROXY,必须显式传 dispatcher。
  const env = process.env;
  const candidate =
    override ??
    env.FAKERADIO_GROK_HTTPS_PROXY ??
    env.HTTPS_PROXY ?? env.https_proxy ??
    env.HTTP_PROXY ?? env.http_proxy ??
    env.ALL_PROXY ?? env.all_proxy;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function createGrokTtsAdapter(options: CreateGrokTtsAdapterOptions): TtsAdapter {
  const cacheManager = createTtsCacheManager(options.cacheDir);
  const baseUrl = (options.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const voice = options.voice ?? "eve";
  const language = options.language ?? "zh";
  const speed = clampSpeed(options.speed ?? 1);
  const style = getSpeechStyleTag(options.style ?? "");
  const timeoutMs = options.timeoutMs ?? 60_000;
  const proxyUrl = resolveProxyUrl(options.httpsProxy);
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  console.log(`[grok-tts] init: voice=${voice} language=${language} proxy=${proxyUrl ?? "(direct)"} style=${style || "(none)"}`);

  return {
    async synthesize(text) {
      const cacheKey = hashGrokPayload(text, voice, language, speed, style);

      if (await cacheManager.exists(cacheKey, "mp3")) {
        return { text, audioUrl: `/cache/tts/${cacheKey}.mp3`, cacheKey };
      }

      let response: Awaited<ReturnType<typeof undiciFetch>> | Response;
      try {
        // 有代理时必须用 undici 的 fetch + ProxyAgent dispatcher。Node 内置 globalThis.fetch
        // 来自旧版 undici,跟外部 undici@7 ProxyAgent 接口不兼容(会抛 'invalid onRequestStart')。
        // 没代理时仍用 globalThis.fetch,这样单测对 globalThis.fetch 的 stub 依然能拦到。
        const fetchFn = dispatcher ? undiciFetch : fetch;
        const init: Parameters<typeof undiciFetch>[1] = {
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
          signal: AbortSignal.timeout(timeoutMs),
          ...(dispatcher ? { dispatcher } : {})
        };
        // fetchFn 在 undiciFetch 和 globalThis.fetch 之间切换,TypeScript 无法
        // 推断联合类型的具体重载,这里统一当 fetch 调用。
        response = await (fetchFn as typeof undiciFetch)(`${baseUrl}/tts`, init);
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
