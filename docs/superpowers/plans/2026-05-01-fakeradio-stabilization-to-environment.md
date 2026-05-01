# FakeRadio Stabilization To Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先消除当前高风险路径读取问题，再把 TTS 口播闭环归档，最后进入环境感知编排。

**Architecture:** 保持本地优先架构：PWA 只连接本地 server，外部能力通过 adapter 进入，环境信息通过 context fragments 影响 DJ brain。安全修复只收紧 cache route，不改变 TTS adapter contract。

**Tech Stack:** Fastify, Next.js, React, TypeScript, Vitest, Zod, pnpm workspace.

---

## File Structure

- Modify: `server/src/http/create-server.ts`
  - 修复 `/cache/tts/*` 路径校验。
  - 后续接入环境快照 builder。
- Modify: `server/src/http/create-server.test.ts`
  - 覆盖 TTS cache 路径逃逸和合法读取。
  - 覆盖环境输入进入 DJ 决策。
- Create: `server/src/environment/environment-context.ts`
  - 把 weather、calendar、devices 组装成稳定 `ContextEnvironment`。
- Create: `server/src/environment/environment-context.test.ts`
  - 测试环境输入格式和 mood hint 组合。
- Modify: `server/src/adapters/llm/mock-llm-adapter.ts`
  - 让 mock DJ 在环境变化时产生可见差异。
- Modify: `.scratch/fakeradio-v1/issues/06-tts-broadcast-loop.md`
  - 若验证通过，更新为 `ready-for-human`。
- Modify: `.scratch/fakeradio-v1/issues/07-environment-aware-programming.md`
  - 实现后更新状态和验收备注。
- Modify: `.scratch/fakeradio-v1/issues/12-secure-tts-cache-route.md`
  - 安全修复后更新状态和验收备注。

---

### Task 1: 修复 TTS Cache 路径逃逸

**Files:**
- Modify: `server/src/http/create-server.ts`
- Test: `server/src/http/create-server.test.ts`
- Issue: `.scratch/fakeradio-v1/issues/12-secure-tts-cache-route.md`

- [ ] **Step 1: 写失败测试**

在 `server/src/http/create-server.test.ts` 增加两个测试：一个确认 sibling 目录不能读取，一个确认合法缓存文件仍可读取。

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

it("rejects TTS cache paths outside the cache directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "fakeradio-tts-route-"));
  const cacheDir = join(tempDir, "cache", "tts");
  const siblingDir = join(tempDir, "cache", "tts2");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(siblingDir, { recursive: true });
  const secretPath = join(siblingDir, "secret.mp3");
  writeFileSync(secretPath, "secret");

  const previousCacheDir = process.env.FAKERADIO_TTS_CACHE_DIR;
  process.env.FAKERADIO_TTS_CACHE_DIR = cacheDir;

  try {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const response = await app.inject({
      method: "GET",
      url: `/cache/tts/${secretPath}`
    });

    expect(response.statusCode).toBe(404);
  } finally {
    process.env.FAKERADIO_TTS_CACHE_DIR = previousCacheDir;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("serves files inside the TTS cache directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "fakeradio-tts-route-"));
  const cacheDir = join(tempDir, "cache", "tts");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "sample.mp3"), "audio");

  const previousCacheDir = process.env.FAKERADIO_TTS_CACHE_DIR;
  process.env.FAKERADIO_TTS_CACHE_DIR = cacheDir;

  try {
    app = await createRadioServer({
      musicAdapterResult: createMockMusicAdapterResult(),
      ttsAdapter: createMockTtsAdapter()
    });

    const response = await app.inject({
      method: "GET",
      url: "/cache/tts/sample.mp3"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("audio");
  } finally {
    process.env.FAKERADIO_TTS_CACHE_DIR = previousCacheDir;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @fakeradio/server test
```

Expected: 路径逃逸测试失败，因为当前 sibling 路径返回 `200`。

- [ ] **Step 3: 最小实现**

在 `server/src/http/create-server.ts` 中改用 `relative()` 校验。

```ts
import { relative, resolve } from "node:path";
```

替换 route 中的路径判断：

```ts
const baseDir = resolve(TTS_CACHE_DIR);
const filePath = resolve(baseDir, filename);
const relativePath = relative(baseDir, filePath);

if (relativePath.startsWith("..") || relativePath === "" || relativePath.startsWith("/") || !existsSync(filePath)) {
  return reply.status(404).send("Not found");
}
```

- [ ] **Step 4: 验证通过**

Run:

```bash
pnpm --filter @fakeradio/server test
pnpm --filter @fakeradio/server typecheck
```

Expected: 全部通过。

- [ ] **Step 5: 更新 issue**

把 `.scratch/fakeradio-v1/issues/12-secure-tts-cache-route.md` 改为：

```md
Status: ready-for-human
```

并追加：

```md
- 2026-05-01 implementation update:
  - `/cache/tts/*` 已使用 `path.relative()` 限制只能读取 cache 目录内文件。
  - 已补充合法缓存读取和 sibling 路径逃逸测试。
```

---

### Task 2: 归档 TTS 口播闭环

**Files:**
- Modify: `.scratch/fakeradio-v1/issues/06-tts-broadcast-loop.md`
- Read: `server/src/adapters/tts/edge-tts-adapter.ts`
- Read: `server/src/http/create-server.ts`
- Read: `apps/web/src/features/player/player-shell.tsx`

- [ ] **Step 1: 验证 TTS 代码路径**

确认这些事实仍成立：

```bash
rg -n "createEdgeTtsAdapter|/cache/tts|speechAudio|restoreMusicVolume|dj-speech" server/src apps/web/src
```

Expected:
- server 使用 `createEdgeTtsAdapter`
- server 暴露 `/cache/tts/*`
- frontend 消费 `dj-speech`
- 播放失败会恢复音乐音量

- [ ] **Step 2: 运行相关测试**

Run:

```bash
pnpm --filter @fakeradio/server test
pnpm --filter @fakeradio/web test
```

Expected: 全部通过。

- [ ] **Step 3: 更新 issue 06**

把 `.scratch/fakeradio-v1/issues/06-tts-broadcast-loop.md` 改为：

```md
Status: ready-for-human
```

追加：

```md
- 2026-05-01 implementation update:
  - DJ 文案、TTS 合成、cache URL、`/cache/tts/*` 和前端 speech audio 已形成闭环。
  - `/api/now` 会保留当前 DJ 文案与 TTS URL。
  - 前端会播放 `dj-speech` 事件里的口播音频，并在失败时恢复音乐音量。
```

---

### Task 3: 环境感知编排第一版

**Files:**
- Create: `server/src/environment/environment-context.ts`
- Create: `server/src/environment/environment-context.test.ts`
- Modify: `server/src/http/create-server.ts`
- Modify: `server/src/adapters/llm/mock-llm-adapter.ts`
- Modify: `server/src/http/create-server.test.ts`
- Modify: `.scratch/fakeradio-v1/issues/07-environment-aware-programming.md`

- [ ] **Step 1: 写环境上下文测试**

Create `server/src/environment/environment-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildEnvironmentContext } from "./environment-context.js";

describe("buildEnvironmentContext", () => {
  it("formats weather, calendar, and device inputs for context fragments", () => {
    const context = buildEnvironmentContext({
      weather: {
        summary: "小雨，适合低密度开场",
        moodHint: "rainy soft focus",
        temperatureC: 18
      },
      calendarItems: [
        {
          title: "专注工作",
          start: "09:00",
          end: "12:00"
        }
      ],
      devices: [
        {
          id: "local-browser",
          name: "Local Browser",
          kind: "browser",
          status: "available"
        }
      ]
    });

    expect(context.weather).toContain("小雨");
    expect(context.weather).toContain("rainy soft focus");
    expect(context.calendar).toContain("09:00 专注工作");
    expect(context.devices).toContain("Local Browser available");
    expect(context.moodHint).toBe("rainy soft focus");
  });
});
```

- [ ] **Step 2: 实现环境上下文 builder**

Create `server/src/environment/environment-context.ts`:

```ts
import type { CalendarItem, PlaybackDevice, WeatherSnapshot } from "../adapters/types.js";
import type { ContextEnvironment } from "../context/context-builder.js";

export type EnvironmentContext = ContextEnvironment & {
  moodHint: string;
};

export function buildEnvironmentContext(input: {
  weather: WeatherSnapshot;
  calendarItems: CalendarItem[];
  devices: PlaybackDevice[];
}): EnvironmentContext {
  return {
    weather: [
      input.weather.summary,
      input.weather.moodHint,
      input.weather.temperatureC === undefined ? "" : `${input.weather.temperatureC}C`
    ]
      .filter(Boolean)
      .join(", "),
    calendar: input.calendarItems.map((item) => `${item.start} ${item.title}`).join(", "),
    devices: input.devices.map((device) => `${device.name} ${device.status}`).join(", "),
    moodHint: input.weather.moodHint
  };
}
```

- [ ] **Step 3: 接入 `/api/next`**

在 `server/src/http/create-server.ts` 引入：

```ts
import { buildEnvironmentContext } from "../environment/environment-context.js";
```

在 `/api/next` 中替换重复环境拼接：

```ts
const environmentContext = buildEnvironmentContext({
  weather: weatherSnapshot,
  calendarItems,
  devices: playbackDevices
});
```

并把两个 `computeDjDecision` 调用中的 `environment` 改为：

```ts
environment: environmentContext
```

把 draft query 的 fallback 改为环境优先：

```ts
const candidates = await music.search(draftDecision.play.query ?? environmentContext.moodHint ?? "warm morning indie");
```

- [ ] **Step 4: 让 mock DJ 显示环境影响**

在 `server/src/adapters/llm/mock-llm-adapter.ts` 中读取 environment fragment：

```ts
const environmentFragment = fragments.find((fragment) => fragment.id === "environment");
const environmentContent = environmentFragment?.content ?? "";
const weatherLine = environmentContent
  .split("\n")
  .find((line) => line.startsWith("weather: "))
  ?.replace("weather: ", "");
```

在 grounded track 文案里加入天气摘要：

```ts
const weatherPrefix = weatherLine ? `${weatherLine}，` : "";
say: `${weatherPrefix}现在接上 ${trackTitle}，先把节奏稳稳放下来。`
```

- [ ] **Step 5: 写 server 集成测试**

在 `server/src/http/create-server.test.ts` 增加断言：

```ts
it("grounds DJ speech in environment context", async () => {
  app = await createRadioServer({
    musicAdapterResult: createMockMusicAdapterResult(),
    ttsAdapter: createMockTtsAdapter()
  });

  const next = await app.inject({ method: "GET", url: "/api/next" });

  expect(next.statusCode).toBe(200);
  expect(next.json().decision.say).toContain("晴，适合轻盈开场");
});
```

- [ ] **Step 6: 验证**

Run:

```bash
pnpm --filter @fakeradio/server test
pnpm --filter @fakeradio/server typecheck
pnpm test
pnpm typecheck
pnpm build
pnpm -r lint
```

Expected: 全部通过。

- [ ] **Step 7: 更新 issue 07**

把 `.scratch/fakeradio-v1/issues/07-environment-aware-programming.md` 改为：

```md
Status: ready-for-human
```

追加：

```md
- 2026-05-01 implementation update:
  - weather、calendar、device 已通过 `buildEnvironmentContext()` 稳定进入 context。
  - mock DJ 文案能体现 weather 输入变化。
  - 环境拼接从 route 内联逻辑收束到独立 builder。
```

---

## Self-Review

- Spec coverage: 覆盖安全修复、06 TTS 闭环归档、07 环境感知第一版。
- Placeholder scan: 没有 `TBD`、`TODO`、`implement later`。
- Type consistency: 使用现有 `WeatherSnapshot`、`CalendarItem`、`PlaybackDevice`、`ContextEnvironment`、`createRadioServer()`。

