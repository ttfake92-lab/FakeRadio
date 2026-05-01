import type { StorySourceNote, Track } from "@fakeradio/shared";
import type { StorySourceAdapter } from "../types.js";
import {
  createNeteaseHttpClient,
  type CreateNeteaseHttpClientOptions,
  type NeteaseFetchJson
} from "../music/netease-http-client.js";

export type CreateNeteaseLyricAdapterOptions = Partial<CreateNeteaseHttpClientOptions> & {
  fetchJson?: NeteaseFetchJson;
};

const DEFAULT_LYRIC_LINE_LIMIT = 8;
const TIMESTAMP_PATTERN = /^\[\d{2}:\d{2}\.\d{2,3}\]/;

function stripTimestamp(line: string): string {
  return line.replace(TIMESTAMP_PATTERN, "").trim();
}

function extractLyricSummary(rawLyric: string, limit: number = DEFAULT_LYRIC_LINE_LIMIT): string {
  const lines = rawLyric
    .split("\n")
    .map(stripTimestamp)
    .filter((line) => line.length > 0);

  return lines.slice(0, limit).join("\n");
}

type LyricResponse = {
  lrc?: {
    lyric?: string;
  };
};

export function createNeteaseLyricAdapter(options: CreateNeteaseLyricAdapterOptions = {}): StorySourceAdapter {
  const fetchJson =
    options.fetchJson ??
    createNeteaseHttpClient({
      baseUrl: options.baseUrl ?? "http://127.0.0.1:3300",
      timeoutMs: options.timeoutMs ?? 2500,
      fetchImpl: options.fetchImpl
    }).fetchJson;

  return {
    async gather(track) {
      const response = (await fetchJson("/lyric", { id: track.id })) as LyricResponse;
      const rawLyric = response.lrc?.lyric;

      if (!rawLyric || rawLyric.trim().length === 0) {
        return [];
      }

      const summary = extractLyricSummary(rawLyric);

      if (summary.length === 0) {
        return [];
      }

      const note: StorySourceNote = {
        kind: "lyric",
        title: track.title,
        content: summary
      };

      return [note];
    }
  };
}
