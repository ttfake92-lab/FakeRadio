import type { AdapterStatus, MusicAdapter } from "../types.js";
import { createDisabledMusicAdapter } from "./disabled-music-adapter.js";
import {
  createNeteaseHttpClient,
  type CreateNeteaseHttpClientOptions
} from "./netease-http-client.js";
import { createNeteaseHttpMusicAdapter } from "./netease-http-music-adapter.js";

type MusicProviderMode = "netease";

type CreateMusicAdapterOptions = Partial<CreateNeteaseHttpClientOptions> & {
  providerMode: MusicProviderMode;
  probeNetease?: () => Promise<boolean>;
  createNeteaseAdapter?: () => MusicAdapter;
  audioLevel?: "standard" | "higher" | "exhigh" | "lossless" | "hires";
};

type MusicAdapterResult = {
  music: MusicAdapter;
  status: AdapterStatus;
  error?: string;
};

const DEFAULT_NETEASE_BASE_URL = "http://127.0.0.1:3300";
const DEFAULT_NETEASE_TIMEOUT_MS = 2500;

export async function probeNeteaseService({
  baseUrl,
  timeoutMs,
  fetchImpl
}: CreateNeteaseHttpClientOptions): Promise<boolean> {
  try {
    await createNeteaseHttpClient({
      baseUrl,
      timeoutMs,
      fetchImpl
    }).fetchJson("/search/hot");

    return true;
  } catch {
    return false;
  }
}

export async function createMusicAdapter({
  providerMode,
  baseUrl = DEFAULT_NETEASE_BASE_URL,
  timeoutMs = DEFAULT_NETEASE_TIMEOUT_MS,
  fetchImpl,
  cookieProvider,
  audioLevel,
  probeNetease,
  createNeteaseAdapter
}: CreateMusicAdapterOptions): Promise<MusicAdapterResult> {
  const available = await (probeNetease?.() ??
    probeNeteaseService({
      baseUrl,
      timeoutMs,
      fetchImpl
    }));

  if (!available) {
    const message = `Netease music service is unavailable at ${baseUrl}`;
    return {
      music: createDisabledMusicAdapter(message),
      status: "disabled",
      error: message
    };
  }

  return {
    music:
      createNeteaseAdapter?.() ??
      createNeteaseHttpMusicAdapter({
        baseUrl,
        timeoutMs,
        fetchImpl,
        cookieProvider,
        ...(audioLevel === undefined ? {} : { audioLevel })
      }),
    status: "ready"
  };
}
