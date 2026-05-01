import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../types.js";
import {
  createNeteaseHttpClient,
  type CreateNeteaseHttpClientOptions,
  type NeteaseFetchJson
} from "./netease-http-client.js";

type NeteaseSong = {
  id: number;
  name: string;
  dt?: number;
  al?: {
    name?: string;
    picUrl?: string;
  };
  ar?: Array<{
    name?: string;
  }>;
};

type CloudSearchResponse = {
  result?: {
    songs?: NeteaseSong[];
  };
};

type SongUrlResponse = {
  data?: Array<{
    id?: number;
    url?: string | null;
  }>;
};

export type CreateNeteaseHttpMusicAdapterOptions = Partial<CreateNeteaseHttpClientOptions> & {
  fetchJson?: NeteaseFetchJson;
};

const DEFAULT_SEARCH_LIMIT = 10;

export function createNeteaseHttpMusicAdapter(
  options: CreateNeteaseHttpMusicAdapterOptions = {}
): MusicAdapter {
  const fetchJson =
    options.fetchJson ??
    createNeteaseHttpClient({
      baseUrl: options.baseUrl ?? "http://127.0.0.1:3300",
      timeoutMs: options.timeoutMs ?? 2500,
      fetchImpl: options.fetchImpl
    }).fetchJson;

  return {
    async search(query) {
      const response = (await fetchJson("/cloudsearch", {
        keywords: query,
        limit: DEFAULT_SEARCH_LIMIT,
        type: 1
      })) as CloudSearchResponse;

      return (response.result?.songs ?? []).map(mapSongToTrack);
    },

    async recommend({ mood, limit }) {
      const tracks = await this.search(mood);
      return tracks.slice(0, limit);
    },

    async resolve(track) {
      const response = (await fetchJson("/song/url", {
        id: track.id
      })) as SongUrlResponse;
      const audioUrl = response.data?.[0]?.url;

      if (!audioUrl) {
        throw new Error(`Unable to resolve audio URL for track ${track.id}`);
      }

      return {
        ...track,
        audioUrl
      };
    }
  };
}

function mapSongToTrack(song: NeteaseSong): Track {
  const artist = song.ar?.map(({ name }) => name).filter(Boolean).join(", ") ?? "";

  return {
    id: String(song.id),
    title: song.name,
    artist: artist || "Unknown Artist",
    album: song.al?.name || "Unknown Album",
    durationMs: typeof song.dt === "number" && song.dt > 0 ? song.dt : undefined,
    artworkUrl: song.al?.picUrl,
    source: "netease"
  };
}
