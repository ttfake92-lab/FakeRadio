import type { StorySourceNote, Track } from "@fakeradio/shared";
import type { StorySourceAdapter } from "../types.js";

export type CreatePublicMetadataAdapterOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type MusicBrainzRecording = {
  score: number;
  title: string;
  "artist-credit"?: Array<{ name: string }>;
  releases?: Array<{ title: string; date?: string }>;
};

type MusicBrainzSearchResponse = {
  recordings?: MusicBrainzRecording[];
};

function buildContent(recording: MusicBrainzRecording): string {
  const artist = recording["artist-credit"]?.map((ac) => ac.name).join(", ") ?? "Unknown Artist";
  const release = recording.releases?.[0];
  const parts: string[] = [];
  parts.push(`曲目：${recording.title}`);
  parts.push(`艺人：${artist}`);
  if (release) {
    parts.push(`专辑：${release.title}`);
    if (release.date) {
      parts.push(`发行日期：${release.date}`);
    }
  }
  parts.push("资料来源：MusicBrainz 公开数据库");
  return parts.join("\n");
}

export function createPublicMetadataAdapter(options: CreatePublicMetadataAdapterOptions = {}): StorySourceAdapter {
  const baseUrl = options.baseUrl ?? "https://musicbrainz.org/ws/2";
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async gather(track) {
      try {
        const query = `recording:"${track.title}" AND artist:"${track.artist}"`;
        const url = new URL(`${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/recording/`);
        url.searchParams.set("query", query);
        url.searchParams.set("fmt", "json");
        url.searchParams.set("limit", "5");

        const response = await fetchImpl(url.toString(), {
          headers: {
            accept: "application/json",
            "user-agent": "FakeRadio/0.1.0 (contact@fakeradio.local)"
          },
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
          return [];
        }

        const data = (await response.json()) as MusicBrainzSearchResponse;
        const recordings = data.recordings ?? [];

        if (recordings.length === 0) {
          return [];
        }

        const best = recordings[0];
        if (best === undefined) {
          return [];
        }
        const confidence = (best.score ?? 0) / 100;

        if (confidence < 0.5) {
          return [];
        }

        const artist = best["artist-credit"]?.map((ac) => ac.name).join(", ") ?? track.artist;

        const note: StorySourceNote = {
          kind: "metadata",
          title: `${best.title} - ${artist}`,
          content: buildContent(best),
          url: `https://musicbrainz.org/search?query=${encodeURIComponent(query)}&type=recording&method=advanced`,
          confidence
        };

        return [note];
      } catch {
        return [];
      }
    }
  };
}
