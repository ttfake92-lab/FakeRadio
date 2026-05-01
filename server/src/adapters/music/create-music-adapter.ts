import type { AdapterStatus, MusicAdapter } from "../types.js";
import { createMockMusicAdapter } from "./mock-music-adapter.js";
import {
  createNeteaseHttpClient,
  type CreateNeteaseHttpClientOptions
} from "./netease-http-client.js";
import { createNeteaseHttpMusicAdapter } from "./netease-http-music-adapter.js";

type MusicProviderMode = "auto" | "mock" | "netease";

type CreateMusicAdapterOptions = Partial<CreateNeteaseHttpClientOptions> & {
  providerMode: MusicProviderMode;
  probeNetease?: () => Promise<boolean>;
  createNeteaseAdapter?: () => MusicAdapter;
};

type MusicAdapterResult = {
  music: MusicAdapter;
  status: AdapterStatus;
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
  probeNetease,
  createNeteaseAdapter
}: CreateMusicAdapterOptions): Promise<MusicAdapterResult> {
  if (providerMode === "mock") {
    return {
      music: createMockMusicAdapter(),
      status: "mock"
    };
  }

  const available = await (probeNetease?.() ??
    probeNeteaseService({
      baseUrl,
      timeoutMs,
      fetchImpl
    }));

  if (!available) {
    return {
      music: createMockMusicAdapter(),
      status: "mock"
    };
  }

  return {
    music:
      createNeteaseAdapter?.() ??
      createNeteaseHttpMusicAdapter({
        baseUrl,
        timeoutMs,
        fetchImpl
      }),
    status: "ready"
  };
}
