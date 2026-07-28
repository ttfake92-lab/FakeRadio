import type { DislikedTrack, Track } from "@fakeradio/shared";
import type { CalendarItem, MusicAdapter, WeatherSnapshot } from "../adapters/types.js";
import type { UserPreferences } from "../user/load-user-preference.js";
import { collectAvoidedArtists } from "../user/disliked-songs-repository.js";

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
  /** 累计 dislike >= 2 的艺术家(小写),候选阶段整体过滤 */
  avoidedArtists?: Set<string>;
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
  /** 用户明确不喜欢的歌(负反馈事实层)。单曲永久硬排除;同艺术家 >=2 次整体降权。 */
  dislikedSongs?: DislikedTrack[];
  /** 测试注入用；默认 Math.random。随机只作用于"取材顺序"(种子采样/艺术家洗牌)，不动个性化来源。 */
  random?: () => number;
};

export function buildRecommendationContext(input: BuildRecommendationContextInput): RecommendationContext {
  const random = input.random ?? Math.random;
  const playlistSeeds = findPlaylistSeeds(input.userPreferences, input.block);
  const baseSeeds = uniqueNonEmpty([input.block.moodHint, ...playlistSeeds]);
  const weatherMood = input.weather.moodHint.trim();
  const tasteKeywords = extractTasteKeywords([
    input.userPreferences.taste,
    input.userPreferences.moodRules,
    input.userPreferences.routines
  ].join("\n"));
  const dislikedSongs = input.dislikedSongs ?? [];
  const dislikedTrackIds = new Set(dislikedSongs.map((entry) => entry.trackId));
  const avoidedArtists = collectAvoidedArtists(dislikedSongs);
  // 用户实际听过的艺术家名是最强的 taste 信号——比"classic rock"这种类别词命中率高得多。
  // 让它们排在 query 列表最前；但用按频次加权的随机顺序,而不是频次降序固定排列,
  // 否则最高频艺术家永远占 query #1,每次开播都是同一批熟面孔。
  const likedArtists = extractTopArtists(input.likedSongs, 8, random)
    .filter((artist) => !avoidedArtists.has(artist.toLocaleLowerCase()));
  const queries = buildQueries(baseSeeds, weatherMood, tasteKeywords, likedArtists);
  const excludedTrackIds = new Set<string>([
    ...input.recentTrackIds,
    ...input.queuedTrackIds,
    ...input.likedSongs.map((track) => track.id),
    // dislike 的单曲永久硬排除,不受最近播放窗口大小限制
    ...dislikedTrackIds
  ]);
  // simi 种子从全部可用收藏里随机采样,而不是固定取文件顺序前 8 首——
  // 固定种子意味着 /simi/song 每次返回同一批相似歌。
  const seedTracks = sampleTracks(
    input.likedSongs.filter((track) =>
      !input.recentTrackIds.has(track.id) &&
      !input.queuedTrackIds.has(track.id) &&
      !dislikedTrackIds.has(track.id) &&
      !isAvoidedArtist(track, avoidedArtists)
    ),
    8,
    random
  );

  return {
    ...input,
    excludedTrackIds,
    seedTracks,
    queries,
    signals: buildSignals(input, tasteKeywords, likedArtists, avoidedArtists),
    avoidedArtists,
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
  /** true = 完全跳过 music.recommend(simi/song),只走 search。
   *  用于风格切换:用户明确要换风格,curated/simi(基于当前喜好)反而是负向信号。 */
  searchOnly?: boolean;
}): Promise<Array<{ track: Track; source: RecommendationCandidateSource }>> {
  const { music, context, limit, searchOnly } = input;
  const excluded = context.excludedTrackIds;
  // simi/song(curated)只能拿到协同过滤的相似歌,容易跑偏品味。
  // 限制它最多贡献一半 limit,把另一半留给 taste/artist 搜索结果。
  // searchOnly 时完全不调 recommend——风格切换场景下 simi 反而是负向。
  const curatedQuota = searchOnly ? 0 : Math.max(1, Math.floor(limit / 2));
  const curated: Array<{ track: Track; source: RecommendationCandidateSource }> = [];
  if (!searchOnly) {
    const recommended = asTrackArray(await Promise.resolve(music.recommend({
      mood: context.queries[0] ?? context.block.moodHint,
      limit: Math.max(curatedQuota * 2, 10),
      seeds: context.seedTracks,
      excludeTrackIds: [...excluded]
    })).catch(() => []));
    for (const track of collectFreshTracks(recommended, excluded, curatedQuota, context.avoidedArtists)) {
      curated.push({ track, source: "curated" as const });
    }
  }

  const collected: Array<{ track: Track; source: RecommendationCandidateSource }> = [...curated];
  const seen = new Set(collected.map((entry) => entry.track.id));
  // 每个 query 最多贡献 perQueryQuota 首,避免第一个 query 命中就把 slot 占满,
  // 让代表艺术家根本拿不到位置。limit=5 时 quota=2 → 至少 3 个不同 query 上榜,
  // 多样性可控;limit=10 时 quota=3,允许强 query 多占一点。
  // 注意:query 数量 >=2 时启用,query=1(单一搜索)时让它独占,避免少候选。
  const perQueryQuota = context.queries.length > 1 ? Math.max(1, Math.ceil(limit / 3)) : limit;
  for (const query of context.queries.slice(0, 8)) {
    if (collected.length >= limit) break;
    const searchResults = asTrackArray(await Promise.resolve(music.search(query)).catch(() => []));
    let addedFromThisQuery = 0;
    for (const track of collectFreshTracks(searchResults, excluded, limit, context.avoidedArtists)) {
      if (seen.has(track.id)) continue;
      if (addedFromThisQuery >= perQueryQuota) break;
      seen.add(track.id);
      collected.push({ track, source: "search" as const });
      addedFromThisQuery += 1;
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
  // 2) taste 关键词 + 天气组合(天气是即时环境,权重高于每日编排的场景词)
  // 3) taste 关键词 + 场景词组合(品味与编排场景对齐)
  // 4) taste 关键词单独
  // 5) 场景词 + 天气(纯场景兜底,排最后)
  const artistQueries = likedArtists.flatMap((artist) => uniqueNonEmpty([
    artist,
    baseSeeds[0] ? `${artist} ${baseSeeds[0]}` : artist
  ]));
  // 天气组合排在编排场景词组合之前: 每日编排是提前定好的静态节奏,
  // 而天气反映"此刻窗外真实发生的事",与听感的相关性更强(下雨天早晨不该按晴天早晨选歌)。
  const tasteWithWeather = weatherSuffix
    ? tasteKeywords.map((keyword) => `${keyword} ${weatherSuffix}`)
    : [];
  const tasteWithMood = tasteKeywords.flatMap((keyword) => uniqueNonEmpty([
    baseSeeds[0] ? `${keyword} ${baseSeeds[0]}` : keyword
  ]));
  const tasteOnly = tasteKeywords;
  const moodQueries = baseSeeds.flatMap((seed) => uniqueNonEmpty([
    weatherSuffix ? `${seed} ${weatherSuffix}` : seed,
    seed
  ]));
  return uniqueNonEmpty([
    ...artistQueries,
    ...tasteWithWeather,
    ...tasteWithMood,
    ...tasteOnly,
    ...moodQueries
  ]);
}

function buildSignals(
  input: BuildRecommendationContextInput,
  tasteKeywords: string[],
  likedArtists: string[],
  avoidedArtists: Set<string>
): string[] {
  return uniqueNonEmpty([
    input.weather.moodHint ? `weather:${input.weather.moodHint}` : "",
    `daypart:${input.block.label}`,
    input.calendar.length > 0 ? "calendar:busy" : "calendar:open",
    input.userPreferences.playlists.length > 0 ? "playlist-seeds" : "",
    input.likedSongs.length > 0 ? "liked-song-seeds" : "",
    (input.dislikedSongs?.length ?? 0) > 0 ? `dislike-excluded:${input.dislikedSongs!.length}` : "",
    ...[...avoidedArtists].map((artist) => `avoid-artist:${artist}`),
    ...likedArtists.map((artist) => `artist:${artist}`),
    ...tasteKeywords.map((keyword) => `taste:${keyword}`)
  ]);
}

function inferEnergy(block: RecommendationBlock, weather: WeatherSnapshot, moodRules: string): RecommendationIntent["energy"] {
  // 天气单独先判: 雨雪雷天气直接压低能量,不管编排 block 是什么时段。
  // 天气因子的权重高于每日编排——编排是静态计划,天气是即时现实。
  const weatherText = `${weather.summary} ${weather.moodHint}`.toLocaleLowerCase();
  if (/rain|storm|snow|雨|雪|雷/.test(weatherText)) {
    return "low";
  }
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

// 从用户的 liked songs 抽 N 个艺术家。这是最强的 taste 信号:
// 用户真的听过这些人,网易云搜艺术家名命中率远高于搜流派词。
// 顺序按频次加权随机:高频艺术家更可能靠前,但不保证永远第一——保留探索空间。
function extractTopArtists(likedSongs: Track[], limit: number, random: () => number = Math.random): string[] {
  const counts = new Map<string, number>();
  for (const track of likedSongs) {
    const artist = track.artist?.trim();
    if (!artist) continue;
    // 网易云 artist 字段有时是 "A / B / C" 多人合作,拆开各计一次。
    for (const piece of artist.split(/[\/、,&]/).map((s) => s.trim()).filter(Boolean)) {
      counts.set(piece, (counts.get(piece) ?? 0) + 1);
    }
  }
  return weightedShuffle([...counts.entries()], random).slice(0, limit);
}

// 按权重无放回抽样,返回完整洗牌序列(权重越大越可能排前)。
function weightedShuffle(entries: Array<[string, number]>, random: () => number): string[] {
  const pool = [...entries];
  const result: string[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = random() * total;
    let picked = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]![1];
      if (roll <= 0) {
        picked = i;
        break;
      }
    }
    result.push(pool[picked]![0]);
    pool.splice(picked, 1);
  }
  return result;
}

// 无放回随机采样 n 个曲目(部分 Fisher-Yates),保持原数组不被修改。
function sampleTracks(tracks: Track[], n: number, random: () => number): Track[] {
  const pool = [...tracks];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

function collectFreshTracks(tracks: Track[], excluded: Set<string>, limit: number, avoidedArtists?: Set<string>): Track[] {
  const seen = new Set<string>();
  const fresh: Track[] = [];
  for (const track of tracks) {
    if (excluded.has(track.id) || seen.has(track.id)) continue;
    if (avoidedArtists && isAvoidedArtist(track, avoidedArtists)) continue;
    seen.add(track.id);
    fresh.push(track);
    if (fresh.length >= limit) break;
  }
  return fresh;
}

// 艺术家匹配用小写规范化,且兼容 "A / B" 多人合作字段。
function isAvoidedArtist(track: Track, avoidedArtists: Set<string>): boolean {
  if (avoidedArtists.size === 0) return false;
  const artist = track.artist?.trim();
  if (!artist) return false;
  return artist
    .split(/[\/、,&]/)
    .map((s) => s.trim().toLocaleLowerCase())
    .some((piece) => piece.length > 0 && avoidedArtists.has(piece));
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
