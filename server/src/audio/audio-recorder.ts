import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Track } from "@fakeradio/shared";
import type { TrackRegistry } from "./track-registry.js";
import type { MusicAdapter } from "../adapters/types.js";
import { getAudioFilePath } from "../utils/shared-utils.js";

export type AudioRecorderDeps = {
  registry: TrackRegistry;
  audioDir: string;
  music?: MusicAdapter;
};

export { getAudioFilePath };

export function isAudioRecorded(audioDir: string, trackId: string): boolean {
  return existsSync(getAudioFilePath(audioDir, trackId));
}

export async function proxyAndRecord(
  deps: AudioRecorderDeps,
  trackId: string
): Promise<{ response: Response; recorded: boolean } | null> {
  let track = deps.registry.get(trackId);
  if (!track?.audioUrl) return null;

  const filePath = getAudioFilePath(deps.audioDir, trackId);
  const alreadyRecorded = existsSync(filePath);

  // 超时只约束"建连到响应头"阶段。不能用 AbortSignal.timeout 贯穿整个
  // body 传输：歌曲流式传输超过 30 秒会被掐断，浏览器把截断当成正常结束
  const fetchWithConnectTimeout = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let upstream: Response;
  try {
    upstream = await fetchWithConnectTimeout(track.audioUrl);
  } catch (err) {
    throw new Error(`audio fetch failed for ${trackId}: ${err instanceof Error ? err.message : "network error"}`);
  }

  // If URL expired (403), try to resolve a fresh URL from music adapter
  if (upstream.status === 403 && deps.music) {
    try {
      const refreshed = await deps.music.resolve(track);
      if (refreshed.audioUrl && refreshed.audioUrl !== track.audioUrl) {
        track = refreshed;
        deps.registry.register(track);
        upstream = await fetchWithConnectTimeout(track.audioUrl!);
      }
    } catch {
      // ignore resolution failure, will throw below if still not ok
    }
  }

  if (!upstream.ok) {
    throw new Error(`upstream audio returned ${upstream.status} for ${trackId}`);
  }

  if (!upstream.body) {
    throw new Error("Upstream audio response has no body");
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  // Reject known non-audio content-types (e.g., netease returns HTML error pages)
  const isLikelyAudio = contentType.startsWith("audio/") || contentType.includes("mpeg") || contentType.includes("mp3");
  if (!isLikelyAudio) {
    throw new Error(`Upstream returned non-audio content-type: ${contentType}`);
  }

  // 透传 content-length：iOS Safari 需要知道总大小才能 seek，
  // 否则把无 content-length 的流当成直播流，重新缓冲时从头恢复
  const contentLength = upstream.headers.get("content-length");
  const passthroughHeaders: Record<string, string> = { "content-type": contentType };
  if (contentLength) passthroughHeaders["content-length"] = contentLength;

  if (alreadyRecorded) {
    return {
      response: new Response(upstream.body, {
        headers: passthroughHeaders
      }),
      recorded: false
    };
  }

  // Tee: one branch to client, one to disk
  const [clientBranch, diskBranch] = upstream.body.tee();

  mkdirSync(dirname(filePath), { recursive: true });
  const fileStream = createWriteStream(filePath);
  pipeline(diskBranch as unknown as Readable, fileStream).catch((err) => {
    console.error(`Audio recording failed for ${trackId}:`, err);
  });

  return {
    response: new Response(clientBranch, {
      headers: passthroughHeaders
    }),
    recorded: true
  };
}
