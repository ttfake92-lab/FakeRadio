# FakeRadio 网易云音乐 Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变前端 contract 的前提下，把 FakeRadio 的音乐来源从纯 mock 扩展为优先使用本地 `NeteaseCloudMusicApi`，并在不可用时自动回退到 mock。

**Architecture:** 保持 `MusicAdapter` 作为唯一音乐入口。新增一个薄的网易云 HTTP client、一个真实 music adapter，以及一个 provider 工厂负责探测和回退。server 启动时决定本次生命周期使用哪个 adapter，并通过 `/api/health` 暴露状态。

**Tech Stack:** TypeScript, Fastify, Vitest, Zod, 本地 `NeteaseCloudMusicApi`

---

## 文件结构

- 新建 `server/src/adapters/music/netease-http-client.ts`
  - 封装 base URL、超时、JSON 请求
- 新建 `server/src/adapters/music/netease-http-music-adapter.ts`
  - 实现 `MusicAdapter`
- 新建 `server/src/adapters/music/create-music-adapter.ts`
  - provider 工厂，负责探测和回退
- 新建 `server/src/adapters/music/netease-http-music-adapter.test.ts`
  - 真实 adapter 单测
- 新建 `server/src/adapters/music/create-music-adapter.test.ts`
  - provider 工厂单测
- 修改 `server/src/config/env.ts`
  - 支持 `auto | mock | netease` 和网易云配置
- 修改 `server/src/adapters/index.ts`
  - 导出新的 music adapter 相关模块
- 修改 `server/src/http/create-server.ts`
  - 使用 provider 工厂替代固定 mock
- 修改 `server/src/http/create-server.test.ts`
  - 增加真实 provider 与回退路径的集成测试
- 修改 `.env.example`
  - 增加网易云相关配置
- 修改 `docs/adapters.md`
  - 写清 music adapter 的真实来源与回退策略
- 修改 `docs/local-runbook.md`
  - 增加本地 `NeteaseCloudMusicApi` 启动说明

### Task 1: 扩展配置模型

**Files:**
- Modify: `server/src/config/env.ts`
- Test: `server/src/config/env.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/config/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("supports auto mode and netease defaults", () => {
    const env = parseEnv({
      FAKERADIO_PROVIDER_MODE: "auto"
    });

    expect(env.FAKERADIO_PROVIDER_MODE).toBe("auto");
    expect(env.FAKERADIO_NETEASE_API_BASE_URL).toBe("http://127.0.0.1:3300");
    expect(env.FAKERADIO_NETEASE_TIMEOUT_MS).toBe(2500);
  });

  it("supports explicit netease mode", () => {
    const env = parseEnv({
      FAKERADIO_PROVIDER_MODE: "netease",
      FAKERADIO_NETEASE_API_BASE_URL: "http://127.0.0.1:4400",
      FAKERADIO_NETEASE_TIMEOUT_MS: "1800"
    });

    expect(env.FAKERADIO_PROVIDER_MODE).toBe("netease");
    expect(env.FAKERADIO_NETEASE_API_BASE_URL).toBe("http://127.0.0.1:4400");
    expect(env.FAKERADIO_NETEASE_TIMEOUT_MS).toBe(1800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fakeradio/server test server/src/config/env.test.ts`

Expected: FAIL because `parseEnv` does not exist and current schema only supports `mock`

- [ ] **Step 3: Write minimal implementation**

Update `server/src/config/env.ts` to expose a pure parser and expanded schema:

```ts
import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  FAKERADIO_PROVIDER_MODE: z.enum(["auto", "mock", "netease"]).default("auto"),
  FAKERADIO_NETEASE_API_BASE_URL: z.string().url().default("http://127.0.0.1:3300"),
  FAKERADIO_NETEASE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500)
});

export function parseEnv(input: Record<string, string | undefined>) {
  return EnvSchema.parse(input);
}

export const env = parseEnv(process.env);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fakeradio/server test server/src/config/env.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/config/env.ts server/src/config/env.test.ts
git commit -m "test: cover music provider env config"
```

### Task 2: 实现网易云 HTTP adapter

**Files:**
- Create: `server/src/adapters/music/netease-http-client.ts`
- Create: `server/src/adapters/music/netease-http-music-adapter.ts`
- Test: `server/src/adapters/music/netease-http-music-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/adapters/music/netease-http-music-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createNeteaseHttpMusicAdapter } from "./netease-http-music-adapter.js";

describe("createNeteaseHttpMusicAdapter", () => {
  it("maps search results into FakeRadio tracks", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      result: {
        songs: [
          {
            id: 101,
            name: "Morning Signal",
            dt: 184000,
            al: { name: "Local First Radio", picUrl: "https://example.com/cover.jpg" },
            ar: [{ name: "FakeRadio Session" }]
          }
        ]
      }
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const tracks = await adapter.search("warm morning indie");

    expect(tracks).toEqual([
      {
        id: "101",
        title: "Morning Signal",
        artist: "FakeRadio Session",
        album: "Local First Radio",
        durationMs: 184000,
        artworkUrl: "https://example.com/cover.jpg",
        source: "netease"
      }
    ]);
  });

  it("uses mood as query for recommend and trims to limit", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      result: {
        songs: [
          { id: 1, name: "A", dt: 1000, al: { name: "A" }, ar: [{ name: "AA" }] },
          { id: 2, name: "B", dt: 2000, al: { name: "B" }, ar: [{ name: "BB" }] }
        ]
      }
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const tracks = await adapter.recommend({ mood: "warm morning indie", limit: 1 });

    expect(fetchJson).toHaveBeenCalledWith("/cloudsearch", expect.objectContaining({ keywords: "warm morning indie" }));
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.source).toBe("netease");
  });

  it("resolves audioUrl from song url response", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      data: [{ id: 101, url: "https://music.example/101.mp3" }]
    });

    const adapter = createNeteaseHttpMusicAdapter({ fetchJson });
    const track = await adapter.resolve({
      id: "101",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "netease"
    });

    expect(track.audioUrl).toBe("https://music.example/101.mp3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fakeradio/server test server/src/adapters/music/netease-http-music-adapter.test.ts`

Expected: FAIL because adapter does not exist

- [ ] **Step 3: Write minimal implementation**

Create `server/src/adapters/music/netease-http-client.ts`:

```ts
export type NeteaseFetchJson = (
  path: string,
  query?: Record<string, string | number | undefined>
) => Promise<unknown>;

export function createNeteaseHttpClient(input: {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): NeteaseFetchJson {
  const fetchImpl = input.fetchImpl ?? fetch;

  return async (path, query = {}) => {
    const url = new URL(path, input.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Netease API request failed: ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };
}
```

Create `server/src/adapters/music/netease-http-music-adapter.ts`:

```ts
import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../types.js";
import type { NeteaseFetchJson } from "./netease-http-client.js";

function mapSong(song: any): Track {
  return {
    id: String(song.id),
    title: song.name,
    artist: song.ar?.map((artist: { name: string }) => artist.name).join(", ") ?? "Unknown Artist",
    album: song.al?.name,
    durationMs: song.dt,
    artworkUrl: song.al?.picUrl,
    source: "netease"
  };
}

export function createNeteaseHttpMusicAdapter(input: { fetchJson: NeteaseFetchJson }): MusicAdapter {
  return {
    async search(query) {
      const payload = (await input.fetchJson("/cloudsearch", { keywords: query, type: 1 })) as any;
      return (payload.result?.songs ?? []).map(mapSong);
    },
    async recommend({ mood, limit }) {
      return (await this.search(mood)).slice(0, limit);
    },
    async resolve(track) {
      const payload = (await input.fetchJson("/song/url", { id: track.id })) as any;
      const audioUrl = payload.data?.[0]?.url;
      if (!audioUrl) {
        throw new Error(`No audio URL available for track ${track.id}`);
      }
      return { ...track, audioUrl };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fakeradio/server test server/src/adapters/music/netease-http-music-adapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/music/netease-http-client.ts server/src/adapters/music/netease-http-music-adapter.ts server/src/adapters/music/netease-http-music-adapter.test.ts
git commit -m "feat: add netease http music adapter"
```

### Task 3: 实现 provider 工厂和回退逻辑

**Files:**
- Create: `server/src/adapters/music/create-music-adapter.ts`
- Modify: `server/src/adapters/index.ts`
- Test: `server/src/adapters/music/create-music-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/adapters/music/create-music-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMusicAdapter } from "./create-music-adapter.js";

describe("createMusicAdapter", () => {
  it("returns netease adapter when service probe succeeds", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const adapter = { search: vi.fn(), recommend: vi.fn(), resolve: vi.fn() };

    const result = await createMusicAdapter({
      providerMode: "auto",
      probeNetease: probe,
      createNeteaseAdapter: () => adapter as any
    });

    expect(probe).toHaveBeenCalled();
    expect(result.status).toBe("ready");
    expect(result.music).toBe(adapter);
  });

  it("falls back to mock when service probe fails", async () => {
    const result = await createMusicAdapter({
      providerMode: "auto",
      probeNetease: vi.fn().mockResolvedValue(false)
    });

    const [track] = await result.music.search("anything");
    expect(result.status).toBe("mock");
    expect(track?.source).toBe("mock");
  });

  it("skips probing in mock mode", async () => {
    const probe = vi.fn();
    const result = await createMusicAdapter({
      providerMode: "mock",
      probeNetease: probe
    });

    expect(probe).not.toHaveBeenCalled();
    expect(result.status).toBe("mock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fakeradio/server test server/src/adapters/music/create-music-adapter.test.ts`

Expected: FAIL because factory does not exist

- [ ] **Step 3: Write minimal implementation**

Create `server/src/adapters/music/create-music-adapter.ts`:

```ts
import type { AdapterStatus, MusicAdapter } from "../types.js";
import { createMockMusicAdapter } from "./mock-music-adapter.js";
import { createNeteaseHttpClient } from "./netease-http-client.js";
import { createNeteaseHttpMusicAdapter } from "./netease-http-music-adapter.js";

export async function probeNeteaseService(input: {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchJson = createNeteaseHttpClient(input);
  try {
    await fetchJson("/search/hot");
    return true;
  } catch {
    return false;
  }
}

export async function createMusicAdapter(input: {
  providerMode: "auto" | "mock" | "netease";
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  probeNetease?: () => Promise<boolean>;
  createNeteaseAdapter?: () => MusicAdapter;
}): Promise<{ music: MusicAdapter; status: AdapterStatus }> {
  if (input.providerMode === "mock") {
    return { music: createMockMusicAdapter(), status: "mock" };
  }

  const probe =
    input.probeNetease ??
    (() =>
      probeNeteaseService({
        baseUrl: input.baseUrl ?? "http://127.0.0.1:3300",
        timeoutMs: input.timeoutMs ?? 2500,
        fetchImpl: input.fetchImpl
      }));

  const available = await probe();
  if (!available) {
    return { music: createMockMusicAdapter(), status: "mock" };
  }

  const music =
    input.createNeteaseAdapter?.() ??
    createNeteaseHttpMusicAdapter({
      fetchJson: createNeteaseHttpClient({
        baseUrl: input.baseUrl ?? "http://127.0.0.1:3300",
        timeoutMs: input.timeoutMs ?? 2500,
        fetchImpl: input.fetchImpl
      })
    });

  return { music, status: "ready" };
}
```

Update `server/src/adapters/index.ts`:

```ts
export * from "./types.js";
export * from "./llm/mock-llm-adapter.js";
export * from "./music/mock-music-adapter.js";
export * from "./music/netease-http-client.js";
export * from "./music/netease-http-music-adapter.js";
export * from "./music/create-music-adapter.js";
export * from "./tts/mock-tts-adapter.js";
export * from "./io/mock-io-adapters.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fakeradio/server test server/src/adapters/music/create-music-adapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/adapters/music/create-music-adapter.ts server/src/adapters/music/create-music-adapter.test.ts server/src/adapters/index.ts
git commit -m "feat: add music adapter factory and fallback"
```

### Task 4: 把 server 接到 provider 工厂

**Files:**
- Modify: `server/src/http/create-server.ts`
- Modify: `server/src/http/create-server.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `server/src/http/create-server.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRadioServer } from "./create-server.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("createRadioServer with music provider factory", () => {
  it("reports ready when netease adapter is selected", async () => {
    app = await createRadioServer({
      musicAdapterResult: {
        status: "ready",
        music: {
          search: async () => [
            { id: "101", title: "Morning Signal", artist: "FakeRadio Session", source: "netease" }
          ],
          recommend: async () => [
            { id: "101", title: "Morning Signal", artist: "FakeRadio Session", source: "netease" }
          ],
          resolve: async (track) => ({ ...track, audioUrl: "https://music.example/101.mp3" })
        }
      }
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    const next = await app.inject({ method: "GET", url: "/api/next" });

    expect(health.json().adapters.music).toBe("ready");
    expect(next.json().track.source).toBe("netease");
  });

  it("falls back to mock contract when music provider is mock", async () => {
    app = await createRadioServer();

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.json().track.source).toBe("mock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fakeradio/server test server/src/http/create-server.test.ts`

Expected: FAIL because `createRadioServer` does not accept injected music adapter result

- [ ] **Step 3: Write minimal implementation**

Update `server/src/http/create-server.ts`:

```ts
import { env } from "../config/env.js";
import { createMusicAdapter } from "../adapters/index.js";

export async function createRadioServer(input?: {
  musicAdapterResult?: {
    music: MusicAdapter;
    status: AdapterStatus;
  };
}) {
  const app = Fastify({ logger: false });
  // register plugins

  const llm = createMockLlmAdapter();
  const { music, status: musicStatus } =
    input?.musicAdapterResult ??
    (await createMusicAdapter({
      providerMode: env.FAKERADIO_PROVIDER_MODE,
      baseUrl: env.FAKERADIO_NETEASE_API_BASE_URL,
      timeoutMs: env.FAKERADIO_NETEASE_TIMEOUT_MS
    }));

  const tts = createMockTtsAdapter();
  // other adapters

  const queue = await music.recommend({ mood: "warm morning indie", limit: 3 });

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: "mock",
        music: musicStatus,
        tts: "mock",
        weather: "mock",
        calendar: "mock",
        upnp: "mock"
      },
      checkedAt: new Date().toISOString()
    })
  );

  // remaining routes unchanged
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fakeradio/server test server/src/http/create-server.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/http/create-server.ts server/src/http/create-server.test.ts
git commit -m "feat: wire server to music adapter factory"
```

### Task 5: 文档与本地运行说明

**Files:**
- Modify: `.env.example`
- Modify: `docs/adapters.md`
- Modify: `docs/local-runbook.md`

- [ ] **Step 1: Write the failing doc expectation**

Define the required additions:

```text
.env.example:
- FAKERADIO_PROVIDER_MODE=auto
- FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
- FAKERADIO_NETEASE_TIMEOUT_MS=2500

docs/adapters.md:
- 说明 music adapter 现支持 mock 与本地网易云 HTTP provider
- 说明 provider 选择由工厂负责
- 说明不可用时自动回退到 mock

docs/local-runbook.md:
- 增加本地 NeteaseCloudMusicApi 启动示例
- 明确默认端口为 3300
```

- [ ] **Step 2: Update docs**

Apply the changes above using concise Chinese wording.

- [ ] **Step 3: Verify docs include the new runtime path**

Run:

```bash
rg -n "3300|FAKERADIO_PROVIDER_MODE|回退到 mock|NeteaseCloudMusicApi" .env.example docs/adapters.md docs/local-runbook.md
```

Expected: all expected lines are found

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/adapters.md docs/local-runbook.md
git commit -m "docs: add netease music adapter runtime notes"
```

### Task 6: 全量验证

**Files:**
- Test: `server/src/config/env.test.ts`
- Test: `server/src/adapters/music/netease-http-music-adapter.test.ts`
- Test: `server/src/adapters/music/create-music-adapter.test.ts`
- Test: `server/src/http/create-server.test.ts`

- [ ] **Step 1: Run focused server tests**

Run:

```bash
pnpm --filter @fakeradio/server test server/src/config/env.test.ts
pnpm --filter @fakeradio/server test server/src/adapters/music/netease-http-music-adapter.test.ts
pnpm --filter @fakeradio/server test server/src/adapters/music/create-music-adapter.test.ts
pnpm --filter @fakeradio/server test server/src/http/create-server.test.ts
```

Expected: PASS

- [ ] **Step 2: Run package verification**

Run:

```bash
pnpm --filter @fakeradio/server test
pnpm --filter @fakeradio/server typecheck
pnpm --filter @fakeradio/shared test
```

Expected: PASS

- [ ] **Step 3: Run repo verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm -r lint
```

Expected: PASS

- [ ] **Step 4: Commit final implementation**

```bash
git add server .env.example docs
git commit -m "feat: add netease music adapter with mock fallback"
```
