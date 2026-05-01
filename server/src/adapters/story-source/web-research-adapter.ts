import type { StorySourceNote, Track } from "@fakeradio/shared";
import type { StorySourceAdapter } from "../types.js";

export type CreateWebResearchAdapterOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

type BraveSearchResult = {
  title: string;
  url: string;
  description?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

function buildQuery(track: Track): string {
  return `${track.title} ${track.artist} song meaning background interview`;
}

function rankConfidence(index: number): number {
  // First result 0.6, second 0.4, third 0.3
  const values = [0.6, 0.4, 0.3];
  return values[index] ?? 0.3;
}

const BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";

export function createWebResearchAdapter(
  options: CreateWebResearchAdapterOptions = {}
): StorySourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey;

  return {
    async gather(track: Track): Promise<StorySourceNote[]> {
      if (!apiKey) {
        return [];
      }

      try {
        const query = buildQuery(track);
        const url = new URL(BRAVE_SEARCH_API_URL);
        url.searchParams.set("q", query);

        const response = await fetchImpl(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey
          },
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          return [];
        }

        const data = (await response.json()) as BraveSearchResponse;
        const results = data.web?.results ?? [];

        if (results.length === 0) {
          return [];
        }

        return results.slice(0, 3).map((result, index) => {
          const note: StorySourceNote = {
            kind: "web",
            title: result.title,
            content: result.description ?? result.title,
            url: result.url,
            confidence: rankConfidence(index)
          };
          return note;
        });
      } catch {
        return [];
      }
    }
  };
}
