# FakeRadio Architecture Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 FakeRadio 的架构完整版骨架，让 PWA 播放器、本地 Node.js 服务、shared contract、mock adapters、用户语料、prompt 和中文文档都能形成可验证闭环。

**Architecture:** 采用 pnpm monorepo：`apps/web` 是 Next.js PWA，`server` 是 Fastify 本地服务，`packages/shared` 保存前后端共享 contract 和事件类型。第一版所有外部能力都走 mock adapter，真实 provider 只能替换 adapter 实现，不能进入核心流程。

**Tech Stack:** TypeScript、pnpm、Next.js、React、Fastify、@fastify/websocket、Zod、Vitest、tsx。

---

## 文件结构锁定

- 创建 `package.json`：根目录脚本、workspace 依赖和统一验证命令。
- 创建 `pnpm-workspace.yaml`：声明 `apps/*`、`server`、`packages/*`。
- 创建 `tsconfig.base.json`：全仓 TypeScript 基础配置和 `@fakeradio/shared` path alias。
- 创建 `vitest.config.ts`：统一测试入口，支持 shared/server/web 测试。
- 创建 `.gitignore`：忽略依赖、构建产物、缓存、本地状态和 worktree。
- 创建 `.env.example`：记录本地端口和 mock provider 开关。
- 创建 `packages/shared/*`：共享 schema、类型、WebSocket 事件。
- 创建 `server/*`：Fastify 服务、mock adapters、context builder、DJ brain、scheduler、state repository。
- 创建 `apps/web/*`：Next.js PWA 薄壳、Player/Profile/Settings 视图、API client、manifest。
- 创建 `user/*` 和 `prompts/*`：自包含的中文用户语料和 DJ prompt。
- 创建 `docs/*.md`：中文架构说明、API contract、adapter 指南、运行手册。

## Task 1: Monorepo 基线

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: 写入根目录配置文件**

Create `package.json`:

```json
{
  "name": "fakeradio",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "dev": "concurrently -k -n server,web -c blue,green \"pnpm --filter @fakeradio/server dev\" \"pnpm --filter @fakeradio/web dev\"",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "@types/node": "^20.19.1",
    "concurrently": "^9.1.2",
    "only-allow": "^1.2.1",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "server"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@fakeradio/shared": ["packages/shared/src/index.ts"],
      "@fakeradio/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedEntry = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));
const sharedRoot = fileURLToPath(new URL("./packages/shared/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@fakeradio/shared": sharedEntry,
      "@fakeradio/shared/": `${sharedRoot}/`
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "server/**/*.test.ts", "apps/**/*.test.ts"]
  }
});
```

Create `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
.turbo/
.DS_Store
.env
.env.local
server/cache/
server/data/
.worktrees/
```

Create `.env.example`:

```bash
FAKERADIO_SERVER_PORT=3001
NEXT_PUBLIC_FAKERADIO_SERVER_URL=http://localhost:3001
FAKERADIO_PROVIDER_MODE=mock
```

- [ ] **Step 2: 安装依赖**

Run:

```bash
pnpm install
```

Expected: exit 0，并生成 `pnpm-lock.yaml`。

- [ ] **Step 3: 提交基线**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: scaffold monorepo baseline"
```

Expected: commit succeeds.

## Task 2: Shared Contract 包

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/contracts/radio.ts`
- Create: `packages/shared/src/events/stream.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/contracts/radio.test.ts`

- [ ] **Step 1: 写入 failing tests**

Create `packages/shared/src/contracts/radio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ChatRequestSchema,
  DjDecisionSchema,
  HealthResponseSchema,
  NowResponseSchema,
  StreamEventSchema,
  TrackSchema
} from "../index";

describe("FakeRadio shared contracts", () => {
  it("validates a playable track", () => {
    const track = TrackSchema.parse({
      id: "mock-001",
      title: "Morning Signal",
      artist: "FakeRadio",
      source: "mock",
      audioUrl: "https://example.com/audio/morning-signal.mp3"
    });

    expect(track.id).toBe("mock-001");
  });

  it("requires a DJ decision to contain either a query or a track id", () => {
    expect(() =>
      DjDecisionSchema.parse({
        say: "我们先来一首让早晨慢慢亮起来的歌。",
        play: {
          reason: "缺少 query 或 trackId"
        },
        reason: "测试非法输出",
        segue: "进入播放"
      })
    ).toThrow();

    const decision = DjDecisionSchema.parse({
      say: "我们先来一首让早晨慢慢亮起来的歌。",
      play: {
        query: "warm morning indie",
        reason: "符合早晨的低刺激启动节奏"
      },
      reason: "用户偏好温暖、松弛、不打扰的开场。",
      segue: "从轻柔的吉他开始。"
    });

    expect(decision.play.query).toBe("warm morning indie");
  });

  it("validates HTTP and stream payload shapes", () => {
    expect(ChatRequestSchema.parse({ message: "来点适合写代码的" }).message).toBe("来点适合写代码的");
    expect(
      HealthResponseSchema.parse({
        ok: true,
        service: "FakeRadio",
        adapters: {
          llm: "mock",
          music: "mock",
          tts: "mock"
        },
        checkedAt: "2026-04-29T00:00:00.000Z"
      }).ok
    ).toBe(true);

    const now = NowResponseSchema.parse({
      playback: "idle",
      track: null,
      dj: {
        say: "电台准备好了。"
      },
      queue: [],
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    expect(StreamEventSchema.parse({ type: "now-playing", payload: now }).type).toBe("now-playing");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test packages/shared/src/contracts/radio.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../index'`。

- [ ] **Step 3: 写入 shared package 实现**

Create `packages/shared/package.json`:

```json
{
  "name": "@fakeradio/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run ../../packages/shared/src/**/*.test.ts",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false
  },
  "include": ["src"]
}
```

Create `packages/shared/src/contracts/radio.ts`:

```ts
import { z } from "zod";

export const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().min(1).optional(),
  durationMs: z.number().int().positive().optional(),
  artworkUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  source: z.enum(["mock", "netease", "local"])
});

export const ContextFragmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  content: z.string(),
  priority: z.number().int(),
  source: z.enum(["system", "user", "environment", "memory", "request", "execution"])
});

export const DjDecisionSchema = z.object({
  say: z.string().min(1),
  play: z
    .object({
      query: z.string().min(1).optional(),
      trackId: z.string().min(1).optional(),
      reason: z.string().min(1)
    })
    .refine((play) => Boolean(play.query ?? play.trackId), {
      message: "play.query or play.trackId is required"
    }),
  reason: z.string().min(1),
  segue: z.string().min(1)
});

export const TtsResultSchema = z.object({
  text: z.string().min(1),
  audioUrl: z.string().min(1),
  cacheKey: z.string().min(1)
});

export const NowResponseSchema = z.object({
  playback: z.enum(["idle", "playing", "paused", "buffering"]),
  track: TrackSchema.nullable(),
  dj: z.object({
    say: z.string(),
    audioUrl: z.string().optional(),
    segue: z.string().optional()
  }),
  queue: z.array(TrackSchema),
  updatedAt: z.string().datetime()
});

export const NextResponseSchema = z.object({
  decision: DjDecisionSchema,
  track: TrackSchema,
  queue: z.array(TrackSchema),
  tts: TtsResultSchema
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1)
});

export const ChatResponseSchema = z.object({
  message: z.string().min(1),
  decision: DjDecisionSchema
});

export const TasteResponseSchema = z.object({
  taste: z.string(),
  routines: z.string(),
  playlists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      seeds: z.array(z.string())
    })
  ),
  moodRules: z.string()
});

export const TodayPlanResponseSchema = z.object({
  date: z.string().min(1),
  blocks: z.array(
    z.object({
      at: z.string().min(1),
      label: z.string().min(1),
      moodHint: z.string().min(1)
    })
  )
});

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("FakeRadio"),
  adapters: z.record(z.string(), z.enum(["mock", "ready", "disabled"])),
  checkedAt: z.string().datetime()
});

export type Track = z.infer<typeof TrackSchema>;
export type ContextFragment = z.infer<typeof ContextFragmentSchema>;
export type DjDecision = z.infer<typeof DjDecisionSchema>;
export type TtsResult = z.infer<typeof TtsResultSchema>;
export type NowResponse = z.infer<typeof NowResponseSchema>;
export type NextResponse = z.infer<typeof NextResponseSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type TasteResponse = z.infer<typeof TasteResponseSchema>;
export type TodayPlanResponse = z.infer<typeof TodayPlanResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

Create `packages/shared/src/events/stream.ts`:

```ts
import { z } from "zod";
import { NowResponseSchema, TrackSchema } from "../contracts/radio";

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("now-playing"),
    payload: NowResponseSchema
  }),
  z.object({
    type: z.literal("queue-updated"),
    payload: z.object({
      queue: z.array(TrackSchema)
    })
  }),
  z.object({
    type: z.literal("dj-speech"),
    payload: z.object({
      text: z.string().min(1),
      audioUrl: z.string().optional()
    })
  }),
  z.object({
    type: z.literal("diagnostic"),
    payload: z.object({
      level: z.enum(["info", "warn", "error"]),
      message: z.string().min(1),
      at: z.string().datetime()
    })
  })
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./contracts/radio";
export * from "./events/stream";
```

- [ ] **Step 4: 运行测试和类型检查**

Run:

```bash
pnpm install
pnpm test packages/shared/src/contracts/radio.test.ts
pnpm --filter @fakeradio/shared typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: 提交 shared contract**

Run:

```bash
git add packages/shared package.json pnpm-lock.yaml
git commit -m "feat: add shared radio contracts"
```

Expected: commit succeeds.

## Task 3: 用户语料与 Prompt 文件

**Files:**
- Create: `user/taste.md`
- Create: `user/routines.md`
- Create: `user/playlists.json`
- Create: `user/mood-rules.md`
- Create: `prompts/dj-persona.md`
- Create: `prompts/context-window.md`

- [ ] **Step 1: 写入用户语料和 prompt**

Create `user/taste.md`:

```md
# FakeRadio 用户品味

## 喜欢

- 低刺激、能持续陪伴的音乐。
- 写作、编程、阅读时适合放在背景里的节奏。
- 早晨偏温暖、轻盈、带一点启动感。
- 晚间偏松弛、空间感、低密度。

## 避免

- 突然大音量进入的歌曲。
- 过度密集的人声。
- 连续播放情绪过满的歌曲。

## DJ 语气

- 简短、自然、有陪伴感。
- 不要像营销播报。
- 每次口播最多两句话。
```

Create `user/routines.md`:

```md
# FakeRadio 日常节奏

## 早晨

- 07:00 到 09:00：从低刺激开始，逐步提高能量。

## 工作时段

- 09:00 到 12:00：稳定、少打扰、适合专注。
- 14:00 到 18:00：允许更强节奏，但保持背景友好。

## 晚间

- 21:00 后：降低能量和语言密度，减少强鼓点。
```

Create `user/playlists.json`:

```json
[
  {
    "id": "morning-soft-start",
    "name": "早晨轻启动",
    "description": "温暖、低刺激、适合开始一天。",
    "seeds": ["warm morning indie", "soft acoustic sunrise", "light city pop"]
  },
  {
    "id": "focus-coding",
    "name": "写代码专注",
    "description": "稳定节奏、少人声、适合持续工作。",
    "seeds": ["instrumental focus", "minimal electronic", "lofi coding"]
  },
  {
    "id": "night-downshift",
    "name": "晚间降速",
    "description": "低密度、空间感、适合收尾。",
    "seeds": ["ambient pop night", "soft piano electronic", "dreamy downtempo"]
  }
]
```

Create `user/mood-rules.md`:

```md
# FakeRadio Mood Rules

- 晴天早晨：温暖、明亮、轻盈。
- 阴雨天气：降低高频刺激，增加空间感。
- 工作时段：优先稳定节奏和少人声。
- 用户主动点歌：尊重用户意图，再用 DJ 口播解释衔接。
- 连续三首同类歌曲后：下一首换一个相邻情绪，避免疲劳。
```

Create `prompts/dj-persona.md`:

```md
# FakeRadio DJ Persona

你是 FakeRadio 的本地个人 DJ。你的任务是根据用户品味、日常节奏、环境信息、近期播放和用户输入，给出一段简短口播，并选择下一首歌。

行为规则：

- 口播自然、克制、像陪伴而不是广告。
- 优先解释为什么这首歌适合当前时刻。
- 不编造真实 provider 已经返回的结果。
- 输出必须能被 `DjDecision` contract 校验。
```

Create `prompts/context-window.md`:

```md
# FakeRadio Context Window

每次触发 DJ 大脑时，按固定顺序组装六类片段：

1. System prompt：DJ 身份和输出规则。
2. 用户语料：taste、routines、playlists、mood rules。
3. 环境注入：now、weather、calendar、device availability。
4. 已检索记忆：recent messages、plays、plans、learned prefs。
5. 用户输入和工具结果：chat message、music search result、adapter result。
6. 执行轨迹：scheduler state、current queue、now playing、TTS cache status。
```

- [ ] **Step 2: 验证 JSON 和文档自包含要求**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('user/playlists.json', 'utf8')); console.log('valid playlists json')"
node -e "const fs=require('node:fs'); const path=require('node:path'); const terms=['参考'+'图','第二'+'张','图'+'片','如上'+'图','见'+'图','上'+'图','下'+'图']; const roots=['user','prompts','docs']; const files=[]; const walk=(dir)=>{for(const name of fs.readdirSync(dir)){const full=path.join(dir,name); const stat=fs.statSync(full); if(stat.isDirectory()) walk(full); else if(full.endsWith('.md')) files.push(full);}}; roots.forEach(walk); const hits=[]; for(const file of files){const text=fs.readFileSync(file,'utf8'); for(const term of terms){if(text.includes(term)) hits.push(`${file}: ${term}`);}} if(hits.length){console.error(hits.join('\n')); process.exit(1);} console.log('docs are self-contained');"
```

Expected: first command prints `valid playlists json`; second command prints no matches.

- [ ] **Step 3: 提交用户语料和 prompt**

Run:

```bash
git add user prompts
git commit -m "docs: add user context and dj prompts"
```

Expected: commit succeeds.

## Task 4: Server Adapter 接口与 Mock 实现

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config/env.ts`
- Create: `server/src/adapters/types.ts`
- Create: `server/src/adapters/llm/mock-llm-adapter.ts`
- Create: `server/src/adapters/music/mock-music-adapter.ts`
- Create: `server/src/adapters/tts/mock-tts-adapter.ts`
- Create: `server/src/adapters/io/mock-io-adapters.ts`
- Create: `server/src/adapters/index.ts`
- Create: `server/src/adapters/mock-adapters.test.ts`

- [ ] **Step 1: 写入 adapter tests**

Create `server/src/adapters/mock-adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter
} from "./index";

describe("mock adapters", () => {
  it("computes a valid DJ decision", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute([
      {
        id: "system",
        label: "System prompt",
        content: "你是 FakeRadio DJ。",
        priority: 1,
        source: "system"
      }
    ]);

    expect(decision.say).toContain("FakeRadio");
    expect(decision.play.query).toBe("warm morning indie");
  });

  it("returns mock music, tts, weather, calendar, and devices", async () => {
    const music = createMockMusicAdapter();
    const [track] = await music.search("warm morning indie");
    expect(track?.source).toBe("mock");

    const resolved = await music.resolve(track!);
    expect(resolved.audioUrl).toContain("example.com");

    const tts = createMockTtsAdapter();
    expect((await tts.synthesize("早上好")).cacheKey).toBe("mock-tts-3");

    expect((await createMockWeatherAdapter().current()).moodHint).toBe("warm and clear");
    expect((await createMockCalendarAdapter().upcoming())).toHaveLength(1);
    expect((await createMockDeviceAdapter().list())[0]?.name).toBe("Local Browser");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/src/adapters/mock-adapters.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './index'`。

- [ ] **Step 3: 写入 server package 和 adapter 实现**

Create `server/package.json`:

```json
{
  "name": "@fakeradio/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run src/**/*.test.ts",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fastify/websocket": "^11.0.2",
    "@fakeradio/shared": "workspace:*",
    "dotenv": "^17.2.3",
    "fastify": "^5.6.1",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "tsx": "^4.20.6",
    "vitest": "^3.2.4"
  }
}
```

Create `server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

Create `server/src/config/env.ts`:

```ts
import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  FAKERADIO_PROVIDER_MODE: z.enum(["mock"]).default("mock")
});

export const env = EnvSchema.parse(process.env);
```

Create `server/src/adapters/types.ts`:

```ts
import type { ContextFragment, DjDecision, Track, TtsResult } from "@fakeradio/shared";

export type AdapterStatus = "mock" | "ready" | "disabled";

export type AdapterHealth = {
  llm: AdapterStatus;
  music: AdapterStatus;
  tts: AdapterStatus;
  weather: AdapterStatus;
  calendar: AdapterStatus;
  upnp: AdapterStatus;
};

export type LlmAdapter = {
  compute(fragments: ContextFragment[]): Promise<DjDecision>;
};

export type MusicAdapter = {
  search(query: string): Promise<Track[]>;
  recommend(input: { mood: string; limit: number }): Promise<Track[]>;
  resolve(track: Track): Promise<Track>;
};

export type TtsAdapter = {
  synthesize(text: string): Promise<TtsResult>;
};

export type WeatherSnapshot = {
  summary: string;
  moodHint: string;
  temperatureC?: number;
};

export type CalendarItem = {
  title: string;
  start: string;
  end: string;
};

export type PlaybackDevice = {
  id: string;
  name: string;
  kind: "browser" | "upnp";
  status: "available" | "offline";
};

export type WeatherAdapter = {
  current(): Promise<WeatherSnapshot>;
};

export type CalendarAdapter = {
  upcoming(): Promise<CalendarItem[]>;
};

export type DeviceAdapter = {
  list(): Promise<PlaybackDevice[]>;
};
```

Create `server/src/adapters/llm/mock-llm-adapter.ts`:

```ts
import { DjDecisionSchema } from "@fakeradio/shared";
import type { LlmAdapter } from "../types";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    async compute() {
      return DjDecisionSchema.parse({
        say: "FakeRadio 已经准备好，我们先用一首温暖、轻盈的歌把状态打开。",
        play: {
          query: "warm morning indie",
          reason: "mock 模式下默认选择低刺激、适合开始工作的音乐。"
        },
        reason: "当前没有真实 provider 输入，使用稳定的 mock 决策验证流程。",
        segue: "从柔和的开场进入播放。"
      });
    }
  };
}
```

Create `server/src/adapters/music/mock-music-adapter.ts`:

```ts
import type { Track } from "@fakeradio/shared";
import type { MusicAdapter } from "../types";

const MOCK_TRACKS: Track[] = [
  {
    id: "mock-track-001",
    title: "Morning Signal",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 184000,
    source: "mock"
  },
  {
    id: "mock-track-002",
    title: "Quiet Compiler",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 206000,
    source: "mock"
  },
  {
    id: "mock-track-003",
    title: "Night Downshift",
    artist: "FakeRadio Session",
    album: "Local First Radio",
    durationMs: 221000,
    source: "mock"
  }
];

export function createMockMusicAdapter(): MusicAdapter {
  return {
    async search() {
      return MOCK_TRACKS;
    },
    async recommend({ limit }) {
      return MOCK_TRACKS.slice(0, limit);
    },
    async resolve(track) {
      return {
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      };
    }
  };
}
```

Create `server/src/adapters/tts/mock-tts-adapter.ts`:

```ts
import type { TtsAdapter } from "../types";

export function createMockTtsAdapter(): TtsAdapter {
  return {
    async synthesize(text) {
      return {
        text,
        audioUrl: `/cache/tts/mock-${text.length}.mp3`,
        cacheKey: `mock-tts-${text.length}`
      };
    }
  };
}
```

Create `server/src/adapters/io/mock-io-adapters.ts`:

```ts
import type { CalendarAdapter, DeviceAdapter, WeatherAdapter } from "../types";

export function createMockWeatherAdapter(): WeatherAdapter {
  return {
    async current() {
      return {
        summary: "晴，适合轻盈开场",
        moodHint: "warm and clear",
        temperatureC: 22
      };
    }
  };
}

export function createMockCalendarAdapter(): CalendarAdapter {
  return {
    async upcoming() {
      return [
        {
          title: "专注工作",
          start: "09:00",
          end: "12:00"
        }
      ];
    }
  };
}

export function createMockDeviceAdapter(): DeviceAdapter {
  return {
    async list() {
      return [
        {
          id: "local-browser",
          name: "Local Browser",
          kind: "browser",
          status: "available"
        }
      ];
    }
  };
}
```

Create `server/src/adapters/index.ts`:

```ts
export * from "./types";
export * from "./llm/mock-llm-adapter";
export * from "./music/mock-music-adapter";
export * from "./tts/mock-tts-adapter";
export * from "./io/mock-io-adapters";
```

- [ ] **Step 4: 运行 adapter 测试和类型检查**

Run:

```bash
pnpm install
pnpm test server/src/adapters/mock-adapters.test.ts
pnpm --filter @fakeradio/server typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: 提交 server adapter**

Run:

```bash
git add server package.json pnpm-lock.yaml
git commit -m "feat: add server mock adapters"
```

Expected: commit succeeds.

## Task 5: Context Builder、DJ Brain、Router、Scheduler、State

**Files:**
- Create: `server/src/context/context-builder.ts`
- Create: `server/src/context/context-builder.test.ts`
- Create: `server/src/brain/dj-brain.ts`
- Create: `server/src/brain/dj-brain.test.ts`
- Create: `server/src/router/intent-router.ts`
- Create: `server/src/scheduler/radio-scheduler.ts`
- Create: `server/src/state/memory-repository.ts`

- [ ] **Step 1: 写入 context 和 brain tests**

Create `server/src/context/context-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContextWindow } from "./context-builder";

describe("buildContextWindow", () => {
  it("builds the six context fragments in deterministic order", () => {
    const fragments = buildContextWindow({
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激音乐。",
      routines: "早晨低刺激启动。",
      moodRules: "晴天温暖轻盈。",
      recentMemory: ["上一首播放 Morning Signal"],
      userMessage: "来点适合写代码的",
      toolResults: ["music.search 返回 3 首 mock 歌曲"],
      executionState: "queue empty",
      environment: {
        weather: "晴，22C",
        calendar: "09:00 专注工作",
        devices: "Local Browser available"
      }
    });

    expect(fragments.map((fragment) => fragment.source)).toEqual([
      "system",
      "user",
      "environment",
      "memory",
      "request",
      "execution"
    ]);
    expect(fragments[1]?.content).toContain("喜欢低刺激音乐");
  });
});
```

Create `server/src/brain/dj-brain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockLlmAdapter } from "../adapters";
import { computeDjDecision } from "./dj-brain";

describe("computeDjDecision", () => {
  it("builds context and returns a validated decision", async () => {
    const decision = await computeDjDecision({
      llm: createMockLlmAdapter(),
      now: new Date("2026-04-29T08:00:00.000Z"),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激音乐。",
      routines: "早晨低刺激启动。",
      moodRules: "晴天温暖轻盈。",
      recentMemory: [],
      userMessage: "早上好",
      toolResults: [],
      executionState: "idle",
      environment: {
        weather: "晴，22C",
        calendar: "09:00 专注工作",
        devices: "Local Browser available"
      }
    });

    expect(decision.play.query).toBe("warm morning indie");
    expect(decision.segue).toContain("开场");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/src/context/context-builder.test.ts server/src/brain/dj-brain.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './context-builder'`。

- [ ] **Step 3: 写入 context、brain、router、scheduler、state 实现**

Create `server/src/context/context-builder.ts`:

```ts
import type { ContextFragment } from "@fakeradio/shared";

export type ContextEnvironment = {
  weather: string;
  calendar: string;
  devices: string;
};

export type BuildContextInput = {
  now: Date;
  systemPrompt: string;
  userTaste: string;
  routines: string;
  moodRules: string;
  recentMemory: string[];
  userMessage?: string;
  toolResults: string[];
  executionState: string;
  environment: ContextEnvironment;
};

export function buildContextWindow(input: BuildContextInput): ContextFragment[] {
  return [
    {
      id: "system",
      label: "System prompt",
      content: input.systemPrompt,
      priority: 1,
      source: "system"
    },
    {
      id: "user",
      label: "用户语料",
      content: [`taste: ${input.userTaste}`, `routines: ${input.routines}`, `moodRules: ${input.moodRules}`].join("\n"),
      priority: 2,
      source: "user"
    },
    {
      id: "environment",
      label: "环境注入",
      content: [
        `now: ${input.now.toISOString()}`,
        `weather: ${input.environment.weather}`,
        `calendar: ${input.environment.calendar}`,
        `devices: ${input.environment.devices}`
      ].join("\n"),
      priority: 3,
      source: "environment"
    },
    {
      id: "memory",
      label: "已检索记忆",
      content: input.recentMemory.join("\n"),
      priority: 4,
      source: "memory"
    },
    {
      id: "request",
      label: "用户输入和工具结果",
      content: [`message: ${input.userMessage ?? ""}`, ...input.toolResults].join("\n"),
      priority: 5,
      source: "request"
    },
    {
      id: "execution",
      label: "执行轨迹",
      content: input.executionState,
      priority: 6,
      source: "execution"
    }
  ];
}
```

Create `server/src/brain/dj-brain.ts`:

```ts
import { DjDecisionSchema, type DjDecision } from "@fakeradio/shared";
import type { LlmAdapter } from "../adapters";
import { buildContextWindow, type BuildContextInput } from "../context/context-builder";

export type ComputeDjDecisionInput = BuildContextInput & {
  llm: LlmAdapter;
};

export async function computeDjDecision(input: ComputeDjDecisionInput): Promise<DjDecision> {
  const fragments = buildContextWindow(input);
  const decision = await input.llm.compute(fragments);
  return DjDecisionSchema.parse(decision);
}
```

Create `server/src/router/intent-router.ts`:

```ts
export type RadioIntent = "chat" | "next-track" | "planned-radio";

export function routeIntent(message: string): RadioIntent {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("下一首") || normalized.includes("next")) {
    return "next-track";
  }

  if (normalized.includes("今天") || normalized.includes("计划") || normalized.includes("plan")) {
    return "planned-radio";
  }

  return "chat";
}
```

Create `server/src/scheduler/radio-scheduler.ts`:

```ts
import type { TodayPlanResponse } from "@fakeradio/shared";

export function buildTodayPlan(now: Date): TodayPlanResponse {
  const date = now.toISOString().slice(0, 10);

  return {
    date,
    blocks: [
      {
        at: "07:00",
        label: "早晨轻启动",
        moodHint: "warm morning indie"
      },
      {
        at: "09:00",
        label: "写代码专注",
        moodHint: "instrumental focus"
      },
      {
        at: "21:00",
        label: "晚间降速",
        moodHint: "ambient pop night"
      }
    ]
  };
}
```

Create `server/src/state/memory-repository.ts`:

```ts
export type MemoryEntry = {
  id: string;
  content: string;
  createdAt: string;
};

export type MemoryRepository = {
  recent(limit: number): Promise<MemoryEntry[]>;
  append(content: string): Promise<MemoryEntry>;
};

export function createInMemoryMemoryRepository(seed: string[] = []): MemoryRepository {
  const entries: MemoryEntry[] = seed.map((content, index) => ({
    id: `seed-${index + 1}`,
    content,
    createdAt: new Date(0).toISOString()
  }));

  return {
    async recent(limit) {
      return entries.slice(-limit);
    },
    async append(content) {
      const entry = {
        id: `memory-${entries.length + 1}`,
        content,
        createdAt: new Date().toISOString()
      };
      entries.push(entry);
      return entry;
    }
  };
}
```

- [ ] **Step 4: 运行测试和类型检查**

Run:

```bash
pnpm test server/src/context/context-builder.test.ts server/src/brain/dj-brain.test.ts
pnpm --filter @fakeradio/server typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: 提交本地大脑核心模块**

Run:

```bash
git add server/src/context server/src/brain server/src/router server/src/scheduler server/src/state
git commit -m "feat: add local radio brain modules"
```

Expected: commit succeeds.

## Task 6: Fastify HTTP 与 WebSocket Contract

**Files:**
- Create: `server/src/http/create-server.ts`
- Create: `server/src/http/create-server.test.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: 写入 HTTP contract tests**

Create `server/src/http/create-server.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRadioServer } from "./create-server";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("createRadioServer", () => {
  it("serves health, now, plan, next, taste, and chat contracts", async () => {
    app = await createRadioServer();

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().service).toBe("FakeRadio");

    const now = await app.inject({ method: "GET", url: "/api/now" });
    expect(now.statusCode).toBe(200);
    expect(now.json().playback).toBe("idle");

    const plan = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().blocks).toHaveLength(3);

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    expect(taste.json().playlists[0].id).toBe("morning-soft-start");

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(next.json().track.id).toBe("mock-track-001");

    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "来点适合写代码的"
      }
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().decision.play.query).toBe("warm morning indie");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/src/http/create-server.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './create-server'`。

- [ ] **Step 3: 写入 Fastify server**

Create `server/src/http/create-server.ts`:

```ts
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  HealthResponseSchema,
  NextResponseSchema,
  NowResponseSchema,
  StreamEventSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  type Track
} from "@fakeradio/shared";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter
} from "../adapters";
import { computeDjDecision } from "../brain/dj-brain";
import { buildTodayPlan } from "../scheduler/radio-scheduler";

const PLAYLISTS = [
  {
    id: "morning-soft-start",
    name: "早晨轻启动",
    description: "温暖、低刺激、适合开始一天。",
    seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
  }
];

export async function createRadioServer() {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const llm = createMockLlmAdapter();
  const music = createMockMusicAdapter();
  const tts = createMockTtsAdapter();
  const weather = createMockWeatherAdapter();
  const calendar = createMockCalendarAdapter();
  const devices = createMockDeviceAdapter();
  let currentTrack: Track | null = null;
  const queue = await music.recommend({ mood: "warm morning indie", limit: 3 });

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "FakeRadio",
      adapters: {
        llm: "mock",
        music: "mock",
        tts: "mock",
        weather: "mock",
        calendar: "mock",
        upnp: "mock"
      },
      checkedAt: new Date().toISOString()
    })
  );

  app.get("/api/now", async () =>
    NowResponseSchema.parse({
      playback: currentTrack ? "playing" : "idle",
      track: currentTrack,
      dj: {
        say: currentTrack ? `正在播放 ${currentTrack.title}` : "FakeRadio 准备好了。"
      },
      queue,
      updatedAt: new Date().toISOString()
    })
  );

  app.get("/api/next", async () => {
    const weatherSnapshot = await weather.current();
    const calendarItems = await calendar.upcoming();
    const playbackDevices = await devices.list();
    const decision = await computeDjDecision({
      llm,
      now: new Date(),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "早晨低刺激启动，工作时段稳定少打扰。",
      moodRules: "晴天早晨温暖轻盈。",
      recentMemory: [],
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: `${weatherSnapshot.summary}, ${weatherSnapshot.moodHint}`,
        calendar: calendarItems.map((item) => `${item.start} ${item.title}`).join(", "),
        devices: playbackDevices.map((device) => `${device.name} ${device.status}`).join(", ")
      }
    });
    const candidates = await music.search(decision.play.query ?? "warm morning indie");
    const track = await music.resolve(candidates[0] ?? queue[0]!);
    currentTrack = track;

    return NextResponseSchema.parse({
      decision,
      track,
      queue,
      tts: await tts.synthesize(decision.say)
    });
  });

  app.post("/api/chat", async (request) => {
    const body = ChatRequestSchema.parse(request.body);
    const decision = await computeDjDecision({
      llm,
      now: new Date(),
      systemPrompt: "你是 FakeRadio DJ。",
      userTaste: "喜欢低刺激、持续陪伴的音乐。",
      routines: "工作时段稳定少打扰。",
      moodRules: "用户主动输入时优先尊重用户意图。",
      recentMemory: [],
      userMessage: body.message,
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: {
        weather: "mock weather",
        calendar: "mock calendar",
        devices: "Local Browser available"
      }
    });

    return ChatResponseSchema.parse({
      message: decision.say,
      decision
    });
  });

  app.get("/api/taste", async () =>
    TasteResponseSchema.parse({
      taste: "喜欢低刺激、能持续陪伴的音乐。",
      routines: "早晨低刺激启动；工作时段稳定少打扰；晚间降速。",
      playlists: PLAYLISTS,
      moodRules: "晴天早晨温暖轻盈；工作时段少人声。"
    })
  );

  app.get("/api/plan/today", async () => TodayPlanResponseSchema.parse(buildTodayPlan(new Date())));

  app.get("/stream", { websocket: true }, (connection) => {
    const event = StreamEventSchema.parse({
      type: "diagnostic",
      payload: {
        level: "info",
        message: "FakeRadio stream connected",
        at: new Date().toISOString()
      }
    });
    connection.send(JSON.stringify(event));
  });

  return app;
}
```

Create `server/src/index.ts`:

```ts
import { env } from "./config/env";
import { createRadioServer } from "./http/create-server";

const app = await createRadioServer();

await app.listen({
  port: env.FAKERADIO_SERVER_PORT,
  host: "127.0.0.1"
});

console.log(`FakeRadio server listening on http://127.0.0.1:${env.FAKERADIO_SERVER_PORT}`);
```

- [ ] **Step 4: 运行 HTTP 测试和类型检查**

Run:

```bash
pnpm test server/src/http/create-server.test.ts
pnpm --filter @fakeradio/server typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: 提交本地 API 服务**

Run:

```bash
git add server/src/http server/src/index.ts
git commit -m "feat: add local radio api server"
```

Expected: commit succeeds.

## Task 7: Next.js PWA 薄壳

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/profile/page.tsx`
- Create: `apps/web/src/app/settings/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/features/player/player-shell.tsx`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/api-client.test.ts`

- [ ] **Step 1: 写入 API client test**

Create `apps/web/src/lib/api-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApiUrl, getServerBaseUrl } from "./api-client";

describe("api-client", () => {
  it("uses localhost server by default", () => {
    expect(getServerBaseUrl()).toBe("http://localhost:3001");
    expect(buildApiUrl("/api/now")).toBe("http://localhost:3001/api/now");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test apps/web/src/lib/api-client.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './api-client'`。

- [ ] **Step 3: 写入 Next.js PWA 文件**

Create `apps/web/package.json`:

```json
{
  "name": "@fakeradio/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run src/**/*.test.ts",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fakeradio/shared": "workspace:*",
    "next": "^16.1.1",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "vitest": "^3.2.4"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@fakeradio/shared": ["../../packages/shared/src/index.ts"],
      "@fakeradio/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

Create `apps/web/public/manifest.webmanifest`:

```json
{
  "name": "FakeRadio",
  "short_name": "FakeRadio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0d0d10",
  "theme_color": "#0d0d10",
  "description": "本地优先的大模型个人音乐电台"
}
```

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FakeRadio",
  description: "本地优先的大模型个人音乐电台",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:

```tsx
import { PlayerShell } from "../features/player/player-shell";

export default function HomePage() {
  return <PlayerShell />;
}
```

Create `apps/web/src/app/profile/page.tsx`:

```tsx
export default function ProfilePage() {
  return (
    <main className="page">
      <h1>Profile</h1>
      <p>这里展示用户品味、日常节奏和歌单种子。</p>
    </main>
  );
}
```

Create `apps/web/src/app/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return (
    <main className="page">
      <h1>Settings</h1>
      <p>这里管理本地 server 地址、provider 模式和播放设备。</p>
    </main>
  );
}
```

Create `apps/web/src/app/globals.css`:

```css
:root {
  color-scheme: dark;
  background: #0d0d10;
  color: #f5f1e8;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #0d0d10;
}

a {
  color: inherit;
}

.page {
  width: min(960px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 32px 0;
}
```

Create `apps/web/src/features/player/player-shell.tsx`:

```tsx
export function PlayerShell() {
  return (
    <main className="page">
      <section aria-labelledby="player-title">
        <p>FakeRadio</p>
        <h1 id="player-title">本地个人音乐电台</h1>
        <p>播放器通过 HTTP 和 WebSocket 连接本地 server；外部能力由 server 的 adapter 统一编排。</p>
        <audio controls preload="none" />
      </section>
      <nav aria-label="FakeRadio views">
        <a href="/profile">Profile</a>
        <span> / </span>
        <a href="/settings">Settings</a>
      </nav>
    </main>
  );
}
```

Create `apps/web/src/lib/api-client.ts`:

```ts
import {
  ChatResponseSchema,
  NextResponseSchema,
  NowResponseSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema
} from "@fakeradio/shared";

export function getServerBaseUrl() {
  return process.env.NEXT_PUBLIC_FAKERADIO_SERVER_URL ?? "http://localhost:3001";
}

export function buildApiUrl(path: string) {
  return new URL(path, getServerBaseUrl()).toString();
}

export async function getNow() {
  const response = await fetch(buildApiUrl("/api/now"));
  return NowResponseSchema.parse(await response.json());
}

export async function getNext() {
  const response = await fetch(buildApiUrl("/api/next"));
  return NextResponseSchema.parse(await response.json());
}

export async function sendChat(message: string) {
  const response = await fetch(buildApiUrl("/api/chat"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ message })
  });
  return ChatResponseSchema.parse(await response.json());
}

export async function getTaste() {
  const response = await fetch(buildApiUrl("/api/taste"));
  return TasteResponseSchema.parse(await response.json());
}

export async function getTodayPlan() {
  const response = await fetch(buildApiUrl("/api/plan/today"));
  return TodayPlanResponseSchema.parse(await response.json());
}
```

- [ ] **Step 4: 运行 web 测试和类型检查**

Run:

```bash
pnpm install
pnpm test apps/web/src/lib/api-client.test.ts
pnpm --filter @fakeradio/web typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: 提交 PWA 薄壳**

Run:

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add pwa player shell"
```

Expected: commit succeeds.

## Task 8: 中文项目文档

**Files:**
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/api-contract.md`
- Create: `docs/adapters.md`
- Create: `docs/local-runbook.md`

- [ ] **Step 1: 写入中文 README 和 docs**

Create `README.md`:

```md
# FakeRadio

FakeRadio 是一个本地优先、由大模型驱动的个人音乐电台。PWA 播放器只连接本地 Node.js server；server 负责用户语料、音乐选择、DJ 口播、TTS、环境输入、状态和调度。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认端口：

- Web: `http://localhost:3000`
- Server: `http://localhost:3001`

## 结构

- `apps/web`：Next.js PWA 播放器。
- `server`：Fastify 本地服务中枢。
- `packages/shared`：前后端共享 contract。
- `user`：用户品味、日程、歌单和 mood rules。
- `prompts`：DJ persona 和 context window 说明。
- `docs`：架构、接口、adapter 和运行说明。
```

Create `docs/architecture.md`:

```md
# FakeRadio 架构

FakeRadio 由四层组成：

1. 外部上下文：用户语料、LLM、音乐 provider、TTS、天气、日历、UPnP。
2. 本地大脑：intent router、context builder、DJ brain、scheduler、TTS cache、state。
3. 运行时 context window：system prompt、用户语料、环境注入、记忆、输入和工具结果、执行轨迹。
4. 交互层：Next.js PWA、HTTP contract、WebSocket stream、单一 audio 元素。

前端永远不直接调用外部服务，只连接本地 server。server 通过 adapter 管理外部能力。
```

Create `docs/api-contract.md`:

```md
# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。
- `GET /api/now`：返回当前播放、DJ 口播和队列。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲和 TTS 结果。
- `POST /api/chat`：向 DJ 发送自然语言消息。
- `GET /api/taste`：返回规范化用户品味。
- `GET /api/plan/today`：返回当天电台计划。

## WebSocket

- `WS /stream`：发送 now-playing、queue-updated、dj-speech、diagnostic 事件。

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
```

Create `docs/adapters.md`:

```md
# FakeRadio Adapter 指南

外部能力必须通过 adapter 接入。

## Adapter 类型

- LLM adapter：输入 context fragments，输出 `DjDecision`。
- Music adapter：搜索、推荐、解析音频 URL、获取歌词。
- TTS adapter：输入 DJ 口播文本，输出缓存音频路径。
- Weather adapter：输入当前环境，输出天气摘要和 mood hint。
- Calendar adapter：输出近期日程上下文。
- Device adapter：输出本地浏览器或 UPnP 设备。

mock adapter 是第一版默认实现。真实 provider 只能替换 adapter，不能绕过 shared contract。
```

Create `docs/local-runbook.md`:

```md
# FakeRadio 本地运行手册

## 安装

```bash
pnpm install
```

## 启动

```bash
pnpm dev
```

## 验证

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 常用接口

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/now
curl http://localhost:3001/api/next
```
```

- [ ] **Step 2: 验证文档自包含**

Run:

```bash
node -e "const fs=require('node:fs'); const path=require('node:path'); const terms=['参考'+'图','第二'+'张','图'+'片','如上'+'图','见'+'图','上'+'图','下'+'图']; const roots=['README.md','docs','AGENTS.md']; const files=[]; const walk=(target)=>{const stat=fs.statSync(target); if(stat.isDirectory()){for(const name of fs.readdirSync(target)) walk(path.join(target,name));} else if(target.endsWith('.md')) files.push(target);}; roots.forEach(walk); const hits=[]; for(const file of files){const text=fs.readFileSync(file,'utf8'); for(const term of terms){if(text.includes(term)) hits.push(`${file}: ${term}`);}} if(hits.length){console.error(hits.join('\n')); process.exit(1);} console.log('docs are self-contained');"
```

Expected: no matches.

- [ ] **Step 3: 提交中文文档**

Run:

```bash
git add README.md docs/architecture.md docs/api-contract.md docs/adapters.md docs/local-runbook.md
git commit -m "docs: add Chinese project documentation"
```

Expected: commit succeeds.

## Task 9: 全量验证与收口

**Files:**
- Modify: no source file changes unless previous tasks exposed a concrete compile or test issue.

- [ ] **Step 1: 安装依赖**

Run:

```bash
pnpm install
```

Expected: exit 0.

- [ ] **Step 2: 运行全量测试**

Run:

```bash
pnpm test
```

Expected: exit 0，所有 Vitest tests pass。

- [ ] **Step 3: 运行全量类型检查**

Run:

```bash
pnpm typecheck
```

Expected: exit 0。

- [ ] **Step 4: 运行全量构建**

Run:

```bash
pnpm build
```

Expected: exit 0。

- [ ] **Step 5: 验证 git 状态**

Run:

```bash
git status --short
```

Expected: no output.

## Self-Review

- Spec coverage：Task 1 覆盖 monorepo 基线；Task 2 覆盖 shared contract；Task 3 覆盖用户语料和 prompt；Task 4 覆盖 adapter 边界；Task 5 覆盖本地大脑、context window、scheduler、state；Task 6 覆盖 HTTP/WebSocket contract；Task 7 覆盖 PWA 播放器薄壳；Task 8 覆盖中文项目文档和自包含要求；Task 9 覆盖全量验证。
- Placeholder scan：计划中不使用常见占位短语，所有新增文件都有具体内容。
- Type consistency：`DjDecision`、`Track`、`TtsResult`、`ContextFragment` 都来自 `@fakeradio/shared`；server 和 web 均通过 shared contract 校验数据。
