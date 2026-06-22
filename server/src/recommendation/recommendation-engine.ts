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
  // 用户实际听过的艺术家名(从 likedSongs 提取 top 8)是最强的 taste 信号——
  // 比"classic rock"这种类别词命中率高得多。让它们排在 query 列表最前。
  const likedArtists = extractTopArtists(input.likedSongs, 8);
  const queries = buildQueries(baseSeeds, weatherMood, tasteKeywords, likedArtists);
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
    signals: buildSignals(input, tasteKeywords, likedArtists),
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
  // simi/song(curated)只能拿到协同过滤的相似歌,容易跑偏品味。
  // 限制它最多贡献一半 limit,把另一半留给 taste/artist 搜索结果。
  const curatedQuota = Math.max(1, Math.floor(limit / 2));
  const recommended = asTrackArray(await Promise.resolve(music.recommend({
    mood: context.queries[0] ?? context.block.moodHint,
    limit: Math.max(curatedQuota * 2, 10),
    seeds: context.seedTracks,
    excludeTrackIds: [...excluded]
  })).catch(() => []));
  const curated = collectFreshTracks(recommended, excluded, curatedQuota).map((track) => ({
    track,
    source: "curated" as const
  }));

  const collected: Array<{ track: Track; source: RecommendationCandidateSource }> = [...curated];
  const seen = new Set(collected.map((entry) => entry.track.id));
  // search 用 taste/artist 优先的 query 列表(buildQueries 已按品味→场景顺序排好)。
  // 拉到 8 个 query 上限给足空间命中真正喜欢的艺术家。
  for (const query of context.queries.slice(0, 8)) {
    if (collected.length >= limit) break;
    const searchResults = asTrackArray(await Promise.resolve(music.search(query)).catch(() => []));
    for (const track of collectFreshTracks(searchResults, excluded, limit)) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      collected.push({ track, source: "search" as const });
      if (collected.length >= limit) return collected;
    }
  }

  // 搜索/simi 全空时，兜底用收藏曲库（过滤掉已排除的），保证尽量有候选可挑。
  // 与 selectRecommendedTrack 的 fallbackLiked 一致——聊天推荐不能"搜不到就什么都不给"。
  if (collected.length === 0) {
    for (const track of collectFreshTracks(context.seedTracks, excluded, limit)) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      collected.push({ track, source: "favorites" as const });
      if (collected.length >= limit) break;
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

function buildQueries(
  baseSeeds: string[],
  weatherMood: string,
  tasteKeywords: string[],
  likedArtists: string[]
): string[] {
  const weatherSuffix = weatherMood.length > 0 ? weatherMood : "";
  // 优先级:
  // 1) 艺术家名(用户实际听过、网易云搜命中率最高)
  // 2) taste 关键词 + 场景词组合(品味与场景对齐)
  // 3) taste 关键词单独
  // 4) 场景词 + 天气(纯场景兜底,排最后)
  const artistQueries = likedArtists.flatMap((artist) => uniqueNonEmpty([
    artist,
    baseSeeds[0] ? `${artist} ${baseSeeds[0]}` : artist
  ]));
  const tasteWithMood = tasteKeywords.flatMap((keyword) => uniqueNonEmpty([
    baseSeeds[0] ? `${keyword} ${baseSeeds[0]}` : keyword,
    weatherSuffix ? `${keyword} ${weatherSuffix}` : keyword
  ]));
  const tasteOnly = tasteKeywords;
  const moodQueries = baseSeeds.flatMap((seed) => uniqueNonEmpty([
    weatherSuffix ? `${seed} ${weatherSuffix}` : seed,
    seed
  ]));
  return uniqueNonEmpty([
    ...artistQueries,
    ...tasteWithMood,
    ...tasteOnly,
    ...moodQueries
  ]);
}

function buildSignals(
  input: BuildRecommendationContextInput,
  tasteKeywords: string[],
  likedArtists: string[]
): string[] {
  return uniqueNonEmpty([
    `daypart:${input.block.label}`,
    input.weather.moodHint ? `weather:${input.weather.moodHint}` : "",
    input.calendar.length > 0 ? "calendar:busy" : "calendar:open",
    input.userPreferences.playlists.length > 0 ? "playlist-seeds" : "",
    input.likedSongs.length > 0 ? "liked-song-seeds" : "",
    ...likedArtists.map((artist) => `artist:${artist}`),
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

export function extractTasteKeywords(text: string): string[] {
  // 显式匹配的常见子风格/经典艺术家簇,作为高质量种子。
  // 艺术家名单独抽出来另走 likedArtists,这里只保留风格/子流派词。
  const candidates: Array<[RegExp, string]> = [
    [/经典摇滚|classic rock|Queen|Beatles|Pink Floyd|Led Zeppelin|Rolling Stones|David Bowie/i, "classic rock"],
    [/后摇|post[-\s]?rock|Sigur Rós/i, "post rock"],
    [/独立民谣|indie folk|民谣|Simon & Garfunkel/i, "indie folk"],
    [/梦泡|自赏|shoegaze|dream pop|Chromatics/i, "dream pop shoegaze"],
    [/钢琴|piano/i, "soft piano"],
    [/少鼓|无鼓|低刺激|low percussion|无打击/i, "low percussion"],
    [/灵魂乐|soul|Al Green/i, "soul"],
    [/ambient|氛围/i, "ambient"]
  ];
  return candidates
    .filter(([pattern]) => pattern.test(text))
    .map(([, keyword]) => keyword);
}

// 从用户的 liked songs 抽 top N 艺术家(按出现频次降序)。这是最强的 taste 信号:
// 用户真的听过这些人,网易云搜艺术家名命中率远高于搜流派词。
function extractTopArtists(likedSongs: Track[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const track of likedSongs) {
    const artist = track.artist?.trim();
    if (!artist) continue;
    // 网易云 artist 字段有时是 "A / B / C" 多人合作,拆开各计一次。
    for (const piece of artist.split(/[\/、,&]/).map((s) => s.trim()).filter(Boolean)) {
      counts.set(piece, (counts.get(piece) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([artist]) => artist);
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
