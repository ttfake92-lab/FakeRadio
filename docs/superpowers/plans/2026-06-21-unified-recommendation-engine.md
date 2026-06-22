# Unified Recommendation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增统一 Recommendation Engine，让实时下一首、预取、队列补充和每日预热都基于电台策划优先的综合推荐，而不是直接复播网易喜欢歌曲。

**Architecture:** 新增 `server/src/recommendation/recommendation-engine.ts` 作为核心推荐编排层。它接收时间段、天气、日程、用户品味、mood rules、playlist seeds、网易喜欢歌曲、最近播放和当前队列，输出可播放候选与诊断；音乐 provider 仍只通过 `MusicAdapter` 查询、相似扩展和解析。

**Tech Stack:** TypeScript、Vitest、Fastify route orchestration、现有 `MusicAdapter` / `WeatherAdapter` / `LikedSongsRepository` / `PlaybackState`。

---

### Task 1: 推荐上下文与查询生成

**Files:**
- Create: `server/src/recommendation/recommendation-engine.ts`
- Test: `server/src/recommendation/recommendation-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("builds curator queries from daypart, weather, playlist seeds, taste, and mood rules", () => {
  const context = buildRecommendationContext({
    now: new Date("2026-06-21T13:30:00+08:00"),
    block: {
      at: "12:00",
      label: "午间轻松",
      moodHint: "light acoustic"
    },
    weather: {
      summary: "小雨",
      moodHint: "rainy",
      temperatureC: 18
    },
    calendar: [],
    userPreferences: {
      taste: "喜欢经典摇滚、后摇、低刺激、少鼓点。",
      routines: "工作时段稳定少打扰。",
      moodRules: "阴雨天气：降低高频刺激，增加空间感。",
      playlists: [
        {
          id: "midday-light",
          name: "午间轻松",
          description: "轻松明亮、适合午休恢复。",
          seeds: ["light acoustic", "chill folk"]
        }
      ]
    },
    likedSongs: [],
    recentTrackIds: new Set(),
    queuedTrackIds: new Set()
  });

  expect(context.intent.priority).toBe("curated-radio");
  expect(context.intent.energy).toBe("low");
  expect(context.queries).toContain("light acoustic rainy");
  expect(context.queries).toContain("chill folk rainy");
  expect(context.queries.some((query) => query.includes("post rock"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/src/recommendation/recommendation-engine.test.ts`
Expected: FAIL because the recommendation module does not exist.

- [ ] **Step 3: Implement minimal context builder**

Create exported types `RecommendationContext`, `RecommendationIntent`, `RecommendationBlock` and function `buildRecommendationContext(input)`. Keep parsing heuristic and deterministic: map rainy weather to low energy and combine current block mood, matching playlist seeds, weather mood, and compact taste keywords.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/src/recommendation/recommendation-engine.test.ts`
Expected: PASS.

### Task 2: 候选生成与收藏歌单降权

**Files:**
- Modify: `server/src/recommendation/recommendation-engine.ts`
- Test: `server/src/recommendation/recommendation-engine.test.ts`
- Modify: `server/src/adapters/types.ts`
- Modify: `server/src/adapters/music/netease-http-music-adapter.ts`
- Test: `server/src/adapters/music/netease-http-music-adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("uses liked songs as taste seeds but selects similar or search candidates before original liked songs", async () => {
  const liked = track("fav-queen", "Somebody To Love", "Queen");
  const similar = track("sim-bowie", "Life On Mars?", "David Bowie");
  const music = fakeMusic({
    recommend: async (input) => input.seeds?.length ? [similar] : [],
    search: async () => [],
    resolve: async (candidate) => ({ ...candidate, audioUrl: `https://audio/${candidate.id}.mp3` })
  });

  const result = await selectRecommendedTrack({
    music,
    context: makeContext({ likedSongs: [liked] }),
    limit: 5
  });

  expect(result.track.id).toBe("sim-bowie");
  expect(result.candidateSource).toBe("curated");
});
```

```ts
it("calls Netease simi song endpoint when recommend receives seed tracks", async () => {
  const fetchJson = vi.fn().mockResolvedValue({
    songs: [
      { id: 202, name: "Similar Song", dt: 2000, al: { name: "Album" }, ar: [{ name: "Artist" }] }
    ]
  });
  const adapter = createNeteaseHttpMusicAdapter({ fetchJson });

  const tracks = await adapter.recommend({
    mood: "rainy classic rock",
    limit: 1,
    seeds: [{ id: "101", title: "Seed", artist: "Seed Artist", source: "netease" }]
  });

  expect(fetchJson).toHaveBeenCalledWith("/simi/song", {
    method: "POST",
    query: { id: "101" }
  });
  expect(tracks[0]?.id).toBe("202");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/src/recommendation/recommendation-engine.test.ts server/src/adapters/music/netease-http-music-adapter.test.ts`
Expected: FAIL because `selectRecommendedTrack` and `recommend(...seeds)` do not exist.

- [ ] **Step 3: Implement candidate generation**

Extend `MusicAdapter.recommend(input)` with optional `seeds?: Track[]` and `excludeTrackIds?: string[]`. In Netease adapter, use `/simi/song` for seeds first, dedupe and filter seed IDs, then fill remaining slots with mood search. In Recommendation Engine, use liked songs only as seeds, prefer curated candidates, and keep direct liked tracks as final fallback only.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/src/recommendation/recommendation-engine.test.ts server/src/adapters/music/netease-http-music-adapter.test.ts`
Expected: PASS.

### Task 3: 接入实时播放、预取、队列和预热

**Files:**
- Modify: `server/src/http/episode-runner.ts`
- Modify: `server/src/http/register-routes.ts`
- Modify: `server/src/scheduler/daily-episode-prewarmer.ts`
- Modify: `packages/shared/src/contracts/radio.ts`
- Test: `server/src/http/episode-runner.favorites.test.ts`
- Test: `server/src/scheduler/daily-episode-prewarmer.test.ts`

- [ ] **Step 1: Write failing integration tests**

```ts
it("selects curated recommendation before directly replaying a liked song", async () => {
  const liked = makeTrack("fav-001", "Favorite Queen Song", "Queen");
  const curated = makeTrack("sim-001", "Curated Bowie Song", "David Bowie");
  const music = createFakeMusicAdapter();
  music.recommend = vi.fn().mockResolvedValue([curated]);
  const deps = buildDeps({ likedSongs: createMockLikedSongsRepo([liked]), music });

  const result = await resolveNextTrackAndDecision(deps);

  expect(result.track.id).toBe("sim-001");
  expect(result.candidateSource).toBe("curated");
  expect(music.resolve).toHaveBeenCalledWith(curated);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/src/http/episode-runner.favorites.test.ts`
Expected: FAIL because current fallback resolves the liked song first.

- [ ] **Step 3: Route all playback entry points through Recommendation Engine**

`resolveNextTrackAndDecision()` builds a current block via `buildTodayPlan` / `getCurrentPlanBlock`, calls weather/calendar/devices once, builds `RecommendationContext`, calls `selectRecommendedTrack()`, then sends selected candidates and diagnostics to LLM. `ensureQueueSize()`, daypart transition queue refill, and `daily-episode-prewarmer` use the same context builder and `selectRecommendedCandidates()` instead of ad hoc `music.recommend()` / `music.search()`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run server/src/recommendation/recommendation-engine.test.ts server/src/http/episode-runner.favorites.test.ts server/src/http/create-server.test.ts server/src/scheduler/daily-episode-prewarmer.test.ts`
Expected: PASS.

### Task 4: Diagnostics and documentation

**Files:**
- Modify: `packages/shared/src/contracts/radio.ts`
- Modify: `docs/adapters.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add diagnostics fields**

Extend `RecommendationDiagnosticsSchema` with `candidateSource: "curated" | "search" | "queue" | "favorites"`, plus optional `signals`, `queries`, and `seedCount`. Keep old fields compatible.

- [ ] **Step 2: Update docs**

Document that `MusicAdapter.recommend()` now accepts optional seed tracks and that the server has a Recommendation Engine combining daypart, weather, routines, mood rules, playlists, liked songs and recent playback.

- [ ] **Step 3: Final verification**

Run:

```bash
pnpm vitest run server/src/recommendation/recommendation-engine.test.ts server/src/adapters/music/netease-http-music-adapter.test.ts server/src/http/episode-runner.favorites.test.ts server/src/http/create-server.test.ts server/src/scheduler/daily-episode-prewarmer.test.ts
pnpm typecheck
pnpm test
```

Expected: all commands exit 0.
