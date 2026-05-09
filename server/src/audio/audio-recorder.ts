import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Track } from "@fakeradio/shared";
import type { TrackRegistry } from "./track-registry.js";

export type AudioRecorderDeps = {
  registry: TrackRegistry;
  audioDir: string;
};

export function getAudioFilePath(audioDir: string, trackId: string): string {
  return resolve(audioDir, `${trackId}.mp3`);
}

export function isAudioRecorded(audioDir: string, trackId: string): boolean {
  return existsSync(getAudioFilePath(audioDir, trackId));
}

export async function proxyAndRecord(
  deps: AudioRecorderDeps,
  trackId: string
): Promise<{ response: Response; recorded: boolean } | null> {
  const track = deps.registry.get(trackId);
  if (!track?.audioUrl) return null;

  const filePath = getAudioFilePath(deps.audioDir, trackId);
  const alreadyRecorded = existsSync(filePath);

  const upstream = await fetch(track.audioUrl, {
    signal: AbortSignal.timeout(30_000)
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream audio fetch failed: ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";

  if (alreadyRecorded) {
    return {
      response: new Response(upstream.body, {
        headers: { "content-type": contentType }
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
      headers: { "content-type": contentType }
    }),
    recorded: true
  };
}
