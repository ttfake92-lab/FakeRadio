# FakeRadio Interactive Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前 PWA 从静态薄壳升级成可操作的本地电台闭环：读取当前播放、生成下一首、发送聊天、展示今日计划和品味摘要，并接收 WebSocket 诊断事件。

**Architecture:** 保持 mock provider 边界不变，只增强本地 server 的运行态和前端交互层。server 在 `/api/next` 后保存最近一次 DJ 口播、TTS 和当前曲目；web 使用一个 client component 调用既有 API client，并通过 `WS /stream` 显示连接状态。

**Tech Stack:** TypeScript、Fastify、@fastify/websocket、Zod、Next.js App Router、React client component、Vitest。

---

## 文件结构锁定

- 修改 `server/src/http/create-server.ts`：保存 now-playing 运行态，复用响应构造，向 WebSocket 客户端广播事件。
- 修改 `server/src/http/create-server.test.ts`：先写 failing test，证明 `/api/next` 后 `/api/now` 返回同一段 DJ 口播、TTS 音频和 segue。
- 修改 `apps/web/src/lib/api-client.ts`：增加 `buildStreamUrl()`，把 HTTP base URL 转成 WebSocket URL。
- 修改 `apps/web/src/lib/api-client.test.ts`：覆盖默认和自定义 base URL 的 WebSocket URL 转换。
- 创建 `apps/web/src/features/player/player-view-model.ts`：集中处理播放器展示文案和时长格式，避免组件里堆逻辑。
- 创建 `apps/web/src/features/player/player-view-model.test.ts`：用 TDD 锁定展示逻辑。
- 修改 `apps/web/src/features/player/player-shell.tsx`：改成 client component，完成 now/next/chat/stream/taste/plan 交互。
- 修改 `apps/web/src/app/globals.css`：提供紧凑、可扫描的播放器界面样式。
- 修改 `docs/local-runbook.md`：补充 `screen` 持久启动方式和 3002 端口调试方式。

## Task 1: Server 保存当前 DJ 状态

**Files:**
- Modify: `server/src/http/create-server.test.ts`
- Modify: `server/src/http/create-server.ts`

- [ ] **Step 1: 写入 failing test**

在 `server/src/http/create-server.test.ts` 增加测试：

```ts
it("keeps the latest DJ speech in now after computing next", async () => {
  app = await createRadioServer();

  const next = await app.inject({ method: "GET", url: "/api/next" });
  expect(next.statusCode).toBe(200);

  const nextBody = next.json();
  const now = await app.inject({ method: "GET", url: "/api/now" });

  expect(now.statusCode).toBe(200);
  expect(now.json()).toMatchObject({
    playback: "playing",
    track: {
      id: nextBody.track.id
    },
    dj: {
      say: nextBody.decision.say,
      audioUrl: nextBody.tts.audioUrl,
      segue: nextBody.decision.segue
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @fakeradio/server test -- create-server.test.ts
```

Expected: FAIL，因为 `/api/now` 仍返回 `正在播放 ...`，没有复用 `/api/next` 的 DJ 口播和 TTS。

- [ ] **Step 3: 实现最小 server 状态**

在 `server/src/http/create-server.ts` 中增加运行态：

```ts
let currentTrack: Track | null = null;
let currentDj: NowResponse["dj"] = {
  say: "FakeRadio 准备好了。"
};
```

在 `/api/now` 中返回 `currentDj`。在 `/api/next` 中合成 TTS 后更新：

```ts
const ttsResult = await tts.synthesize(decision.say);
currentTrack = track;
currentDj = {
  say: decision.say,
  audioUrl: ttsResult.audioUrl,
  segue: decision.segue
};
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @fakeradio/server test -- create-server.test.ts
```

Expected: PASS。

## Task 2: WebSocket URL contract

**Files:**
- Modify: `apps/web/src/lib/api-client.test.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: 写入 failing tests**

在 `apps/web/src/lib/api-client.test.ts` 增加：

```ts
it("builds websocket stream url from the default server", () => {
  expect(buildStreamUrl("/stream")).toBe("ws://localhost:3001/stream");
});

it("builds secure websocket stream url from https server", () => {
  vi.stubEnv("NEXT_PUBLIC_FAKERADIO_SERVER_URL", "https://radio.local:3443");

  expect(buildStreamUrl("/stream")).toBe("wss://radio.local:3443/stream");

  vi.unstubAllEnvs();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @fakeradio/web test -- api-client.test.ts
```

Expected: FAIL，因为 `buildStreamUrl` 尚不存在。

- [ ] **Step 3: 实现 `buildStreamUrl`**

在 `apps/web/src/lib/api-client.ts` 中增加：

```ts
export function buildStreamUrl(path: string) {
  const url = new URL(path, getServerBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @fakeradio/web test -- api-client.test.ts
```

Expected: PASS。

## Task 3: Player 展示模型

**Files:**
- Create: `apps/web/src/features/player/player-view-model.ts`
- Create: `apps/web/src/features/player/player-view-model.test.ts`

- [ ] **Step 1: 写入 failing tests**

创建 `apps/web/src/features/player/player-view-model.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { formatDuration, getPlaybackLabel } from "./player-view-model";

describe("player view model", () => {
  it("labels playback states in Chinese", () => {
    expect(getPlaybackLabel("idle")).toBe("待机");
    expect(getPlaybackLabel("playing")).toBe("播放中");
    expect(getPlaybackLabel("paused")).toBe("已暂停");
    expect(getPlaybackLabel("buffering")).toBe("缓冲中");
  });

  it("formats track duration", () => {
    expect(formatDuration(184000)).toBe("3:04");
    expect(formatDuration(undefined)).toBe("未知时长");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @fakeradio/web test -- player-view-model.test.ts
```

Expected: FAIL，因为 helper 文件尚不存在。

- [ ] **Step 3: 实现 helper**

创建 `apps/web/src/features/player/player-view-model.ts`：

```ts
import type { NowResponse } from "@fakeradio/shared";

export function getPlaybackLabel(playback: NowResponse["playback"]) {
  const labels: Record<NowResponse["playback"], string> = {
    idle: "待机",
    playing: "播放中",
    paused: "已暂停",
    buffering: "缓冲中"
  };
  return labels[playback];
}

export function formatDuration(durationMs: number | undefined) {
  if (durationMs === undefined) {
    return "未知时长";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @fakeradio/web test -- player-view-model.test.ts
```

Expected: PASS。

## Task 4: PWA 交互播放器

**Files:**
- Modify: `apps/web/src/features/player/player-shell.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: 改造播放器组件**

把 `apps/web/src/features/player/player-shell.tsx` 改成 client component，状态包括 `now`、`nextResult`、`chatMessage`、`chatReply`、`taste`、`plan`、`streamStatus`、`error` 和 `isLoading`。组件加载时并行调用 `getNow()`、`getTaste()`、`getTodayPlan()`，并连接 `buildStreamUrl("/stream")`。

- [ ] **Step 2: 添加用户操作**

添加三个明确操作：

- “刷新当前”：调用 `getNow()`。
- “生成下一首”：调用 `getNext()` 后更新当前播放和最近决策。
- “发送给 DJ”：调用 `sendChat(chatMessage)`，展示 DJ 回复。

- [ ] **Step 3: 添加样式**

在 `apps/web/src/app/globals.css` 中使用深色工作台布局、紧凑卡片、明确按钮状态和移动端单列布局。不要添加营销式 hero，不添加装饰性渐变球。

- [ ] **Step 4: 运行 web 测试和类型检查**

Run:

```bash
pnpm --filter @fakeradio/web test
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS。

## Task 5: 运行手册补充

**Files:**
- Modify: `docs/local-runbook.md`

- [ ] **Step 1: 补充稳定启动方式**

在 `docs/local-runbook.md` 增加：

```bash
screen -dmS fakeradio-server zsh -lc 'cd /Users/tt/projects/FakeRadio && FAKERADIO_SERVER_PORT=3001 pnpm --filter @fakeradio/server dev'
screen -dmS fakeradio-web zsh -lc 'cd /Users/tt/projects/FakeRadio && NEXT_PUBLIC_FAKERADIO_SERVER_URL=http://127.0.0.1:3001 pnpm --filter @fakeradio/web exec next dev -p 3002'
```

- [ ] **Step 2: 补充停止方式**

在 `docs/local-runbook.md` 增加：

```bash
screen -S fakeradio-server -X quit
screen -S fakeradio-web -X quit
```

## Task 6: 全量验证与收口

**Files:**
- Verify only.

- [ ] **Step 1: 全量测试**

Run:

```bash
pnpm test
```

Expected: PASS。

- [ ] **Step 2: 类型检查**

Run:

```bash
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 3: 构建**

Run:

```bash
pnpm build
```

Expected: PASS。

- [ ] **Step 4: 浏览器验收**

启动 server 和 web 后打开 `http://127.0.0.1:3002/`，确认：

- 页面显示当前播放状态。
- 点击“生成下一首”后出现曲名、DJ 口播、TTS 路径和决策原因。
- 聊天输入能返回 DJ 回复。
- WebSocket 状态显示已连接或最近诊断消息。

## Self-Review

- Spec coverage：覆盖交互层的 HTTP、WebSocket、单一 audio、Player/Profile/Settings 入口中 Player 的可操作闭环。
- Placeholder scan：无 TBD、TODO 或“稍后实现”。
- Type consistency：复用 `NowResponse`、`NextResponse`、`ChatResponse`、`TasteResponse`、`TodayPlanResponse` 和既有 API client 命名。
