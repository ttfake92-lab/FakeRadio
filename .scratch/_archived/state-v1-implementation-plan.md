# FakeRadio Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement four major upgrades: (1) SQLite-backed StateRepository, (2) source-driven story narration, (3) real weather/Lark adapters + scheduler loop, (4) PWA shell + issue archival.

**Architecture:**
- Phase 1 introduces `StateRepository` (SQLite) as the single persistence foundation for all runtime state that was previously in-memory
- Phase 2 reorders `/api/episode/next` so LLM narration is generated *after* source gathering, using gathered sources as context
- Phase 3 upgrades the pure-function scheduler to a background interval loop; real weather/Lark adapters replace mocks
- Phase 4 adds service worker + manifest for PWA installability; bulk-archives implemented issues

**Tech Stack:** SQLite via `better-sqlite3`, Node.js `fetch`, Lark Open API, Workbox-style service worker

---

## Phase 1: StateRepository — Unified Persistence

### SQLite vs JSONL Decision

**Recommendation: SQLite**

| | JSONL | SQLite |
|---|---|---|
| Query flexibility | Append-only, full-file scan | Indexed queries on timestamp, trackId |
| Write atomicity | File-level only | Transactional |
| Schema evolution | Free-form, error-prone | ALTER TABLE |
| Random access | O(n) | O(1) by primary key |

Data requiring relational queries (time-range scans on played_tracks, filtering dj_messages by date) justifies SQLite over JSONL.

---

### Task 1.1: Create StateRepository

**File:** `server/src/state/state-repository.ts` (new)

```typescript
import Database from "better-sqlite3";
import type { Track } from "@fakeradio/shared";

export type PlayedTrack = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  source: Track["source"];
  playedAt: string;
};

export type DjMessage = {
  id: string;
  text: string;
  trackId: string | null;
  storyType: "background" | "lyric-theme" | "mood-reading" | null;
  createdAt: string;
};

export type QueueSnapshot = {
  id: string;
  trackIds: string[];
  blockAt: string | null;
  createdAt: string;
};

export type PrefsUpdate = {
  id: string;
  key: string;
  valueJson: string;
  updatedAt: string;
};

export type StateRepository = {
  recordPlayedTrack(track: PlayedTrack): Promise<void>;
  getRecentlyPlayed(limit: number, since?: string): Promise<PlayedTrack[]>;
  appendDjMessage(msg: Omit<DjMessage, "id" | "createdAt">): Promise<DjMessage>;
  getDjMessagesToday(): Promise<DjMessage[]>;
  snapshotQueue(trackIds: string[], blockAt: string | null): Promise<QueueSnapshot>;
  getLatestQueueSnapshot(): Promise<QueueSnapshot | null>;
  upsertPref(key: string, value: unknown): Promise<void>;
  getPref<T>(key: string): Promise<T | null>;
  getStartupState(): Promise<{
    lastPlayedTracks: PlayedTrack[];
    todayDjMessages: DjMessage[];
    lastQueueSnapshot: QueueSnapshot | null;
    latestPrefs: PrefsUpdate[];
  }>;
  pruneOldData(beforeIso: string): Promise<number>;
};

export function createStateRepository(dbPath: string): StateRepository {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS played_tracks (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, title TEXT NOT NULL,
      artist TEXT NOT NULL, album TEXT, source TEXT NOT NULL, played_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dj_messages (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, track_id TEXT,
      story_type TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queue_snapshots (
      id TEXT PRIMARY KEY, track_ids TEXT NOT NULL, block_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prefs_updates (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_played_tracks_played_at ON played_tracks(played_at);
    CREATE INDEX IF NOT EXISTS idx_dj_messages_created_at ON dj_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_queue_snapshots_created_at ON queue_snapshots(created_at);
  `);

  const stmtInsertTrack = db.prepare(`
    INSERT INTO played_tracks (id, track_id, title, artist, album, source, played_at)
    VALUES (@id, @trackId, @title, @artist, @album, @source, @playedAt)
  `);
  const stmtInsertDj = db.prepare(`
    INSERT INTO dj_messages (id, text, track_id, story_type, created_at)
    VALUES (@id, @text, @trackId, @storyType, @createdAt)
  `);
  const stmtSnapshotQueue = db.prepare(`
    INSERT INTO queue_snapshots (id, track_ids, block_at, created_at)
    VALUES (@id, @trackIds, @blockAt, @createdAt)
  `);
  const stmtUpsertPref = db.prepare(`
    INSERT INTO prefs_updates (id, key, value_json, updated_at)
    VALUES (@id, @key, @valueJson, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET value_json = @valueJson, updated_at = @updatedAt
  `);

  const run = ((sql: string, params: Record<string, unknown>) =>
    db.prepare(sql).run(params)) as Database['prepare'] extends (sql: string) => infer R
    ? (sql: string, params: Record<string, unknown>) => R extends { run(): unknown } ? void : never
    : never;

  function mapRowToPlayedTrack(row: unknown): PlayedTrack {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      trackId: r.track_id as string,
      title: r.title as string,
      artist: r.artist as string,
      album: r.album as string | null,
      source: r.source as PlayedTrack["source"],
      playedAt: r.played_at as string,
    };
  }

  function mapRowToDjMessage(row: unknown): DjMessage {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      text: r.text as string,
      trackId: r.track_id as string | null,
      storyType: r.story_type as DjMessage["storyType"],
      createdAt: r.created_at as string,
    };
  }

  return {
    recordPlayedTrack(track: PlayedTrack) {
      run(stmtInsertTrack as unknown as string, {
        id: track.id,
        trackId: track.trackId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        source: track.source,
        playedAt: track.playedAt,
      });
    },
    getRecentlyPlayed(limit: number, since?: string) {
      const rows = since
        ? (db.prepare(`SELECT * FROM played_tracks WHERE played_at >= ? ORDER BY played_at DESC LIMIT ?`).all(since, limit) as unknown[])
        : (db.prepare(`SELECT * FROM played_tracks ORDER BY played_at DESC LIMIT ?`).all(limit) as unknown[]);
      return rows.map(mapRowToPlayedTrack);
    },
    appendDjMessage(msg) {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      run(stmtInsertDj as unknown as string, {
        id, text: msg.text, trackId: msg.trackId ?? null, storyType: msg.storyType ?? null, createdAt,
      });
      return { id, ...msg, createdAt };
    },
    getDjMessagesToday() {
      const today = new Date().toISOString().split('T')[0];
      const rows = db.prepare(`SELECT * FROM dj_messages WHERE created_at >= ? ORDER BY created_at ASC`).all(today) as unknown[];
      return rows.map(mapRowToDjMessage);
    },
    snapshotQueue(trackIds: string[], blockAt: string | null) {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      run(stmtSnapshotQueue as unknown as string, {
        id, trackIds: JSON.stringify(trackIds), blockAt, createdAt,
      });
      return { id, trackIds, blockAt, createdAt };
    },
    getLatestQueueSnapshot() {
      const row = db.prepare(`SELECT * FROM queue_snapshots ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
      if (!row) return null;
      return { id: row.id as string, trackIds: JSON.parse(row.track_ids as string), blockAt: row.block_at as string | null, createdAt: row.created_at as string };
    },
    upsertPref(key: string, value: unknown) {
      run(stmtUpsertPref as unknown as string, {
        id: crypto.randomUUID(), key, valueJson: JSON.stringify(value), updatedAt: new Date().toISOString(),
      });
    },
    getPref<T>(key: string) {
      const row = db.prepare(`SELECT value_json FROM prefs_updates WHERE key = ?`).get(key) as { value_json: string } | undefined;
      return row ? (JSON.parse(row.value_json) as T) : null;
    },
    getStartupState() {
      const today = new Date().toISOString().split('T')[0];
      return {
        lastPlayedTracks: this.getRecentlyPlayed(50),
        todayDjMessages: this.getDjMessagesToday(),
        lastQueueSnapshot: this.getLatestQueueSnapshot(),
        latestPrefs: db.prepare(`SELECT * FROM prefs_updates ORDER BY updated_at DESC`).all() as unknown as PrefsUpdate[],
      };
    },
    pruneOldData(beforeIso: string) {
      const result = db.prepare(`DELETE FROM played_tracks WHERE played_at < ?`).run(beforeIso);
      return result.changes;
    },
  };
}
```

**SQLite binding**: Use `better-sqlite3` (synchronous, fast). Note: has native bindings — must be rebuilt for Bun vs Node差异，在多 runtime 环境下需注意。

### Task 1.2: Wire StateRepository into createServer

**Modify:** `server/src/http/create-server.ts`

```typescript
import { resolve } from "path";
// Before createPlaybackState
const stateRepo = createStateRepository(resolve(userDir, "fakeradio.db"));
const { lastPlayedTracks, todayDjMessages, lastQueueSnapshot, latestPrefs } =
  await stateRepo.getStartupState();

const restoredQueue = lastQueueSnapshot
  ? (JSON.parse(lastQueueSnapshot.trackIds) as Track[])
  : initialQueue;

const state = createPlaybackState(restoredQueue);
```

### Task 1.3: Add writes to /api/episode/next

**Modify:** `server/src/http/register-routes.ts`

**需要 import:** `import { randomUUID } from "crypto"` (Node.js 内置，无需安装)

After `state.rememberSelectedTrack(track)`:
```typescript
await stateRepo.recordPlayedTrack({ id: randomUUID(), trackId: track.id, title: track.title, artist: track.artist, album: track.album ?? null, source: track.source, playedAt: new Date().toISOString() });
```

After `state.setDj(dj)`:
```typescript
await stateRepo.appendDjMessage({ text: decision.say, trackId: track.id, storyType: storyType });
```

After `state.setQueue(queue)` (debounced 500ms):
```typescript
// setTimeout-debounced snapshotQueue call
```

### Task 1.4: Tests

**File:** `server/src/state/state-repository.test.ts` (new)
- Test all CRUD methods
- Test `getStartupState` returns correct shape
- Test `pruneOldData` deletes correctly

---

## Phase 2: Source-grounded Story Composer

### Current Flow
```
resolveNextTrackAndDecision() → synthesizeWithFallback(decision.say) → gatherEpisodeSources() → determineStoryType()
```

### New Flow
```
resolveNextTrackAndDecision() → gatherEpisodeSources() → narrateStoryWithSources() → synthesizeWithFallback()
```

### Task 2.1: Add narrateStoryWithSources

**Modify:** `server/src/http/episode-runner.ts`

**需要 import:**
```typescript
import type { ContextEnvironment } from "../context/context-builder.js";
import type { RadioEpisode } from "@fakeradio/shared";
```

```typescript
function hasHighConfidenceBackgroundSource(sources: RadioEpisode["sources"]): boolean {
  return sources.some(
    (s) => (s.kind === "metadata" || s.kind === "web") && (s.confidence ?? 0) >= 0.5
  );
}

function formatSourcesForLLM(sources: RadioEpisode["sources"]): string {
  return sources.map((s) => `[${s.kind}] ${s.title}\n${s.content}`).join("\n---\n");
}

export async function narrateStoryWithSources(
  llm: LlmAdapter,
  track: Track,
  sources: RadioEpisode["sources"],
  systemPrompt: string,
  recentMemory: string[],
  contextEnv: ContextEnvironment,
  userTaste: string,
  routines: string,
  moodRules: string
): Promise<{ narration: string; storyType: RadioEpisode["story"]["type"] }> {
  const rawType = determineStoryType(sources);
  const effectiveType = (rawType === "background" && !hasHighConfidenceBackgroundSource(sources))
    ? (sources.some((s) => s.kind === "lyric") ? "lyric-theme" : "mood-reading")
    : rawType;

  const sourceContext = formatSourcesForLLM(sources);
  const fragments = buildContextWindow({
    now: new Date(),
    systemPrompt: systemPrompt + `\n\n你是故事叙述者。基于以下曲目来源信息，为听众创作一段电台口播叙述。\n\n曲目: ${track.title} - ${track.artist}\n故事类型: ${effectiveType}\n\n来源:\n${sourceContext}`,
    userTaste,
    routines,
    moodRules,
    recentMemory,
    toolResults: [],
    executionState: "narrate-story",
    environment: contextEnv,
  });

  const decision = await llm.compute(fragments);
  return { narration: decision.say, storyType: effectiveType };
}
```

### Task 2.2: Update /api/episode/next handler

**Modify:** `register-routes.ts`

Move `gatherEpisodeSources()` call before TTS synthesis. Replace raw `decision.say` usage with:
```typescript
const sources = await gatherEpisodeSources(...);
const { narration, storyType } = await narrateStoryWithSources(
  llm, track, sources, systemPrompt, recentMemory,
  contextEnv, userTaste, routines, moodRules
);
const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(tts, ttsCacheDir, narration);
```

### Task 2.3: Expose candidateSource/rerankSource in diagnostics

**Modify:** `packages/shared/src/contracts/radio.ts`

在 `NextResponseSchema` 的 `diagnostics` 字段中添加（如果尚未存在）：
```typescript
candidateSource: z.string().optional(),
rerankSource: z.string().optional(),
```

这些值从 `ResolveResult` (在 `server/src/brain/dj-brain.ts` 的 `resolveNextTrack` 返回类型中) 获取。

---

## Phase 3: Real Adapters + Scheduler Loop

### Task 3.1: OpenWeatherMap Adapter

**File:** `server/src/adapters/io/weather-adapter.ts` (new)

```typescript
import type { WeatherAdapter } from "../../adapters/types.js";
import type { WeatherSnapshot } from "../../adapters/types.js";

interface OpenWeatherMapResponse {
  weather: Array<{ description: string }>;
  main: { temp: number };
}

function mapWeatherToMood(data: OpenWeatherMapResponse): string {
  const desc = data.weather[0]?.description?.toLowerCase() ?? "";
  if (desc.includes("rain") || desc.includes("storm")) return "冷冽而深邃";
  if (desc.includes("cloud")) return "柔和而内敛";
  if (desc.includes("snow")) return "纯净而轻盈";
  return "温暖而明亮";
}

export function createWeatherAdapter({ apiKey }: { apiKey: string }): WeatherAdapter {
  return {
    async current(): Promise<WeatherSnapshot> {
      const data = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=Shanghai&units=metric&appid=${apiKey}`
      ).then((r) => r.json() as OpenWeatherMapResponse);
      return {
        summary: data.weather[0]?.description ?? "unknown",
        moodHint: mapWeatherToMood(data),
        temperatureC: data.main.temp,
      };
    },
  };
}
```

### Task 3.2: Lark Calendar Adapter

**File:** `server/src/adapters/io/lark-calendar-adapter.ts` (new)

```typescript
import type { CalendarAdapter, CalendarItem } from "../../adapters/types.js";

interface LarkTokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache: LarkTokenCache | null = null;

async function getLarkToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: clientId, app_secret: clientSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Lark auth failed: ${data.msg}`);
  tokenCache = { accessToken: data.tenant_access_token, expiresAt: Date.now() + data.expire * 1000 };
  return tokenCache.accessToken;
}

export function createLarkCalendarAdapter(opts: {
  clientId: string;
  clientSecret: string;
}): CalendarAdapter {
  return {
    async upcoming(): Promise<CalendarItem[]> {
      const token = await getLarkToken(opts.clientId, opts.clientSecret);
      const now = new Date();
      const end = new Date(now.getTime() + 8 * 60 * 60 * 1000); // next 8 hours
      const res = await fetch(
        `https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events?start_time=${Math.floor(now.getTime() / 1000)}&end_time=${Math.floor(end.getTime() / 1000)}&fields=title,start_time,end_time`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      return (data.items ?? []).map((ev: { summary: string; start_time: { date_time: string }; end_time: { date_time: string } }) => ({
        title: ev.summary,
        start: ev.start_time.date_time,
        end: ev.end_time.date_time,
      }));
    },
  };
}
```

### Task 3.3: Scheduler Loop

**File:** `server/src/scheduler/scheduler-loop.ts` (new)

```typescript
import type { TodayPlanResponse } from "@fakeradio/shared";
import { getCurrentPlanBlock } from "./radio-scheduler.js";

export type SchedulerLoop = {
  start(): void;
  stop(): void;
};

export function createSchedulerLoop(options: {
  intervalMs?: number;
  onDaypartChange?(block: TodayPlanResponse["blocks"][number]): void;
  onHourlyTick?(hour: number): void;
  nowProvider(): Date;
  planBuilder(now: Date): TodayPlanResponse;
}): SchedulerLoop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastBlockAt: string | null = null;
  let lastHour = -1;

  return {
    start() {
      const tick = () => {
        const now = options.nowProvider();
        const plan = options.planBuilder(now);
        const block = getCurrentPlanBlock(plan, now);
        if (block?.at !== lastBlockAt) {
          lastBlockAt = block?.at ?? null;
          options.onDaypartChange?.(block);
        }
        const currentHour = now.getHours();
        if (currentHour !== lastHour) {
          lastHour = currentHour;
          options.onHourlyTick?.(currentHour);
        }
      };
      tick();
      timer = setInterval(tick, options.intervalMs ?? 60_000);
    },
    stop() {
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
  };
}
```

Wire in `create-server.ts`: `schedulerLoop.start()`, `server.addHook("onClose", () => schedulerLoop.stop())`.

---

## Phase 4: PWA + Issue Archival

### Task 4.1: Service Worker

**File:** `apps/web/public/sw.js` (new)

```javascript
const CACHE_NAME = "fakeradio-shell-v1";
const STATIC_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.url.includes("/api/")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
```

### Task 4.2: Register SW in layout

**Modify:** `apps/web/src/app/layout.tsx`

```typescript
useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }
}, []);
```

### Task 4.3: Diagnostics panel in player

**Modify:** `apps/web/src/features/player/player-shell.tsx`

在 diagnostics 显示区域添加（如果 `nextResult.diagnostics` 存在）：
```typescript
{nextResult.diagnostics?.candidateSource && (
  <span className="text-xs opacity-60">候选: {nextResult.diagnostics.candidateSource}</span>
)}
{nextResult.diagnostics?.rerankSource && (
  <span className="text-xs opacity-60">重排: {nextResult.diagnostics.rerankSource}</span>
)}
```

### Task 4.4: Issue archival

Update `.scratch/fakeradio-v1/issues/*.md` Status from `ready-for-human` to `archived` with implementation date.

---

## Critical Files

| File | Change |
|---|---|
| `server/src/state/state-repository.ts` | NEW — SQLite persistence foundation |
| `server/src/http/create-server.ts` | Wire StateRepository, scheduler loop, real adapters |
| `server/src/http/episode-runner.ts` | Add narrateStoryWithSources(), new story flow |
| `server/src/http/register-routes.ts` | Persistence writes, updated /api/next flow |
| `server/src/scheduler/scheduler-loop.ts` | NEW — background interval loop |
| `server/src/adapters/io/weather-adapter.ts` | NEW — OpenWeatherMap |
| `server/src/adapters/io/lark-calendar-adapter.ts` | NEW — Lark calendar |
| `apps/web/public/sw.js` | NEW — service worker |
| `apps/web/src/app/layout.tsx` | Register SW |
| `apps/web/src/features/player/player-shell.tsx` | Show diagnostics |
| `packages/shared/src/contracts/radio.ts` | Expose candidateSource/rerankSource |
