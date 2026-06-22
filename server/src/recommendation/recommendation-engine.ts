import type { Track } from "@fakeradio/shared";
import type { CalendarItem, MusicAdapter, WeatherSnapshot } from "../adapters/types.js";
import type { UserPreferences } from "../user/load-user-preference.js";

export type RecommendationBlock = {
  at: string;
  label: string;
  moodHint: string;
};

export type RecommendationIntent = {
  priority: "curated-radio";
  energy: "low" | "medium" | "high";
  daypart: string;
  weatherMood: string;
};

export type RecommendationContext = {
  now: Date;
  block: RecommendationBlock;
  weather: WeatherSnapshot;
  calendar: CalendarItem[];
  userPreferences: UserPreferences;
  likedSongs: Track[];
  recentTrackIds: Set<string>;
  queuedTrackIds: Set<string>;
  excludedTrackIds: Set<string>;
  seedTracks: Track[];
  queries: string[];
  signals: string[];
  intent: RecommendationIntent;
};

export type RecommendationCandidateSource = "curated" | "search" | "favorites";

export type RecommendedTrackResult = {
  track: Track;
  candidates: Track[];
  candidateSource: RecommendationCandidateSource;
  queries: string[];
  signals: string[];
  seedCount: number;
};

export type BuildRecommendationContextInput = {
  now: Date;
  block: RecommendationBlock;
  weather: WeatherSnapshot;
  calendar: CalendarItem[];
  userPreferences: UserPreferences;
  likedSongs: Track[];
  recentTrackIds: Set<string>;
  queuedTrackIds: Set<string>;
};

export function buildRecommendationContext(input: BuildRecommendationContextInput): RecommendationContext {
  const playlistSeeds = findPlaylistSeeds(input.userPreferences, input.block);
  const baseSeeds = uniqueNonEmpty([input.block.moodHint, ...playlistSeeds]);
  const weatherMood = input.weather.moodHint.trim();
  const tasteKeywords = extractTasteKeywords([
    input.userPreferences.taste,
    input.userPreferences.moodRules,
    input.userPreferences.routines
  ].join("\n"));
  const queries = buildQueries(baseSeeds, weatherMood, tasteKeywords);
  const excludedTrackIds = new Set<string>([
    ...input.recentTrackIds,
    ...input.queuedTrackIds,
    ...input.likedSongs.map((track) => track.id)
  ]);
  const seedTracks = input.likedSongs
    .filter((track) => !input.recentTrackIds.has(track.id) && !input.queuedTrackIds.has(track.id))
    .slice(0, 8);

  return {
    ...input,
    excludedTrackIds,
    seedTracks,
    queries,
    signals: buildSignals(input, tasteKeywords),
    intent: {
      priority: "curated-radio",
      energy: inferEnergy(input.block, input.weather, input.userPreferences.moodRules),
      daypart: input.block.label,
      weatherMood
    }
  };
}

export async function selectRecommendedTrack(input: {
  music: MusicAdapter;
  context: RecommendationContext;
  limit: number;
}): Promise<RecommendedTrackResult> {
  const candidates = await selectRecommendedCandidates(input);
  const fallbackLiked = input.context.seedTracks.find((track) => !input.context.excludedTrackIds.has(track.id));
  const ordered = candidates.length > 0
    ? candidates
    : fallbackLiked
      ? [{ track: fallbackLiked, source: "favorites" as const }]
      : [];

  for (const candidate of ordered) {
    try {
      const resolved = await input.music.resolve(candidate.track);
      return {
        track: resolved,
        candidates: ordered.map((entry) => entry.track),
        candidateSource: candidate.source,
        queries: input.context.queries,
        signals: input.context.signals,
        seedCount: input.context.seedTracks.length
      };
    } catch {
      // Try the next candidate; unavailable songs are common with real providers.
    }
  }

  throw new Error("No recommended track available");
}

export async function selectRecommendedCandidates(input: {
  music: MusicAdapter;
  context: RecommendationContext;
  limit: number;
}): Promise<Array<{ track: Track; source: RecommendationCandidateSource }>> {
  const { music, context, limit } = input;
  const excluded = context.excludedTrackIds;
  const recommended = asTrackArray(await Promise.resolve(music.recommend({
    mood: context.queries[0] ?? context.block.moodHint,
    limit: Math.max(limit * 2, 10),
    seeds: context.seedTracks,
    excludeTrackIds: [...excluded]
  })).catch(() => []));
  const curated = collectFreshTracks(recommended, excluded, limit).map((track) => ({
    track,
    source: "curated" as const
  }));
  if (curated.length >= limit) return curated;

  const collected: Array<{ track: Track; source: RecommendationCandidateSource }> = [...curated];
  const seen = new Set(collected.map((entry) => entry.track.id));
  for (const query of context.queries.slice(0, 4)) {
    const searchResults = asTrackArray(await Promise.resolve(music.search(query)).catch(() => []));
    for (const track of collectFreshTracks(searchResults, excluded, limit)) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      collected.push({ track, source: "search" as const });
      if (collected.length >= limit) return collected;
    }
  }

  return collected;
}

function asTrackArray(value: unknown): Track[] {
  return Array.isArray(value) ? value : [];
}

function findPlaylistSeeds(userPreferences: UserPreferences, block: RecommendationBlock): string[] {
  const matched = userPreferences.playlists.find((playlist) =>
    playlist.name === block.label ||
    playlist.id === block.label ||
    playlist.seeds.includes(block.moodHint)
  );
  return matched?.seeds ?? [];
}

function buildQueries(baseSeeds: string[], weatherMood: string, tasteKeywords: string[]): string[] {
  const weatherSuffix = weatherMood.length > 0 ? weatherMood : "";
  const seedQueries = baseSeeds.flatMap((seed) => uniqueNonEmpty([
    weatherSuffix ? `${seed} ${weatherSuffix}` : seed,
    seed
  ]));
  const tasteQueries = tasteKeywords.flatMap((keyword) => uniqueNonEmpty([
    weatherSuffix ? `${keyword} ${weatherSuffix}` : keyword,
    baseSeeds[0] ? `${keyword} ${baseSeeds[0]}` : keyword
  ]));
  return uniqueNonEmpty([...seedQueries, ...tasteQueries]);
}

function buildSignals(input: BuildRecommendationContextInput, tasteKeywords: string[]): string[] {
  return uniqueNonEmpty([
    `daypart:${input.block.label}`,
    input.weather.moodHint ? `weather:${input.weather.moodHint}` : "",
    input.calendar.length > 0 ? "calendar:busy" : "calendar:open",
    input.userPreferences.playlists.length > 0 ? "playlist-seeds" : "",
    input.likedSongs.length > 0 ? "liked-song-seeds" : "",
    ...tasteKeywords.map((keyword) => `taste:${keyword}`)
  ]);
}

function inferEnergy(block: RecommendationBlock, weather: WeatherSnapshot, moodRules: string): RecommendationIntent["energy"] {
  const text = `${block.at} ${block.label} ${block.moodHint} ${weather.summary} ${weather.moodHint} ${moodRules}`.toLocaleLowerCase();
  if (
    text.includes("rain") ||
    text.includes("雨") ||
    text.includes("night") ||
    text.includes("晚") ||
    text.includes("午夜") ||
    text.includes("降低") ||
    block.at >= "21:00" ||
    block.at < "07:00"
  ) {
    return "low";
  }
  if (text.includes("focus") || text.includes("专注") || text.includes("morning") || text.includes("早")) {
    return "medium";
  }
  return "medium";
}

function extractTasteKeywords(text: string): string[] {
  const candidates: Array<[RegExp, string]> = [
    [/经典摇滚|Queen|Beatles|Pink Floyd|Led Zeppelin|Rolling Stones|David Bowie/i, "classic rock"],
    [/后摇|post[-\s]?rock/i, "post rock"],
    [/独立民谣|indie folk|民谣/i, "indie folk"],
    [/梦泡|自赏|shoegaze|dream pop/i, "dream pop shoegaze"],
    [/钢琴|piano/i, "soft piano"],
    [/少鼓|无鼓|低刺激|low percussion/i, "low percussion"]
  ];
  return candidates
    .filter(([pattern]) => pattern.test(text))
    .map(([, keyword]) => keyword);
}

function collectFreshTracks(tracks: Track[], excluded: Set<string>, limit: number): Track[] {
  const seen = new Set<string>();
  const fresh: Track[] = [];
  for (const track of tracks) {
    if (excluded.has(track.id) || seen.has(track.id)) continue;
    seen.add(track.id);
    fresh.push(track);
    if (fresh.length >= limit) break;
  }
  return fresh;
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
