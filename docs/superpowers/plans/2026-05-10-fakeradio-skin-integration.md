# FakeRadio 前端皮肤集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 FakeRadio-frontend 的 5 套皮肤（amber/pixel/terminal/bento/y2k）集成到现有 FakeRadio 项目，替换现有的 terminal-fm/morning-console 主题，新增 SSE 流式聊天和主题切换面板。

**Architecture:**
- 后端：新增 `POST /api/chat/stream` SSE 端点，发送 `event: chunk`（句子片段）+ `event: done`（含完整文本和 action）
- 前端：新增 `use-chat-sse.ts` hook 管理 SSE 连接，`useRadioBridge.ts` 提供兼容 skin 组件的 `r` 对象
- 皮肤：5 套独立 `.tsx` 文件，通过 `.fr-*` 前缀实现 CSS 隔离
- 事件桥接：皮肤组件的交互通过 props/onChange 回调连接到 `player-shell.tsx` 现有 handler

**Tech Stack:** Fastify (server), Next.js App Router, React 18, plain CSS with prefixes

---

## 文件结构概览

```
server/src/http/
  chat-sse-handler.ts         # 新增：SSE 流式聊天 handler
  register-routes.ts           # 修改：注册 /api/chat/stream

apps/web/src/
  features/player/
    use-chat-sse.ts           # 新增：SSE 连接管理 hook
    use-radio-bridge.ts       # 新增：bridge hook，构造兼容 r 对象
    skin-amber.tsx            # 新增：暖橙胶片皮肤
    skin-pixel.tsx            # 新增：像素 Game Boy 皮肤
    skin-terminal.tsx         # 新增：终端 TUI 皮肤
    skin-bento.tsx            # 新增：Bento 玻璃皮肤
    skin-y2k.tsx              # 新增：Y2K/Win98 皮肤
    skins.css                 # 新增：5 套皮肤 CSS（前缀 .fr-*）
    on-air-terminal.tsx       # 修改：扩展 theme prop，集成设置面板
    player-view-model.ts      # 修改：ON_AIR_THEMES 扩展为 5 主题
    player-shell.tsx          # 修改：集成 useRadioBridge、avatar 状态
  app/
    layout.tsx               # 修改：加载 Google Fonts
    globals.css              # 修改：导入 skins.css
  lib/
    api-client.ts            # 修改：新增 sendChatStream 函数
packages/shared/src/contracts/
  radio.ts                   # 修改：ChatSSEChunkSchema、ChatDoneSchema
```

---

## Task 1: 后端 SSE 聊天端点

**Files:**
- Create: `server/src/http/chat-sse-handler.ts`
- Modify: `server/src/http/register-routes.ts:185`
- Test: `server/src/http/chat-sse-handler.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/src/http/chat-sse-handler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildChatSSEHandler } from "./chat-sse-handler.js";

describe("buildChatSSEHandler", () => {
  let mockReply: any;
  beforeEach(() => {
    mockReply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      hijack: vi.fn(),
    };
  });

  it("emits chunk events with sentence fragments", async () => {
    const chunks: string[] = [];
    const donePayloads: any[] = [];

    mockReply.sse = vi.fn((cb) => {
      // Simulate SSE emission
      return mockReply;
    });

    // Capture the stream emitter passed to the callback
    let emitter: any;
    mockReply.rawEmitter = {
      emit: (event: string, data: any) => {
        if (event === "chunk") chunks.push(data);
        if (event === "done") donePayloads.push(data);
      },
      on: vi.fn(),
      off: vi.fn(),
    };

    const sendEvent = (event: string, data: any) => {
      if (event === "chunk") chunks.push(data);
      if (event === "done") donePayloads.push(data);
    };

    const handler = buildChatSSEHandler({ sendEvent });

    // Mock the internal LLM call to return predictable sentences
    const mockDeps = {
      systemPrompt: "你是一个 DJ。",
      userMessage: "你好",
      currentTrack: null,
      mood: "夜行",
    };

    await handler(mockDeps, { sendEvent } as any);

    expect(chunks.length).toBeGreaterThan(0);
    // Last chunk should be a complete sentence
    expect(donePayloads[0]).toHaveProperty("text");
    expect(donePayloads[0]).toHaveProperty("action");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tt/projects/FakeRadio/server && npx vitest run src/http/chat-sse-handler.test.ts`
Expected: FAIL (file does not exist)

- [ ] **Step 3: Write minimal SSE handler implementation**

```typescript
// server/src/http/chat-sse-handler.ts
import type { RegisterRoutesDeps } from "./types.js";
import type { Track } from "@fakeradio/shared";

export type ChatSSECallbacks = {
  sendEvent(event: "chunk" | "done", data: string | ChatDonePayload): void;
};

export type ChatDonePayload = {
  text: string;
  action?: { type: string; trackId?: string; title?: string; artist?: string };
};

function splitIntoSentences(text: string): string[] {
  // Split by Chinese/punctuation sentence delimiters
  const sentences: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (/[。！？.!?]/.test(char)) {
      sentences.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences.filter(Boolean);
}

export function buildChatSSEHandler(deps: Pick<RegisterRoutesDeps, "llm" | "userPreferences" | "state" | "sessionRepo" | "trackRegistry" | "audioDir" | "exportDir" | "tts" | "ttsCacheDir" | "music" | "weather" | "calendar" | "devices" | "storySource" | "publicMetadataAdapter" | "webResearchAdapter" | "currentMoodHint" | "nowProvider" | "systemPrompt" | "favorites" | "likedSongs" | "memory" | "musicStatus">) {
  return async function handleChatSSE(
    body: unknown,
    callbacks: ChatSSECallbacks
  ): Promise<void> {
    const parsed = (await import("@fakeradio/shared")).ChatRequestSchema.parse(body);
    const message = parsed.message.trim();
    const currentTrack = deps.state.getCurrentTrack();
    const mood = deps.userPreferences.moodRules?.defaultMood ?? "夜行";

    // Determine intent
    if (/^(下一首|next|切歌|换一首)/i.test(message)) {
      // Delegate to existing next-track logic - emit done immediately
      callbacks.sendEvent("done", { text: "正在切歌...", action: { type: "next-track" } });
      return;
    }

    // Default: LLM chat - stream sentence by sentence
    const { computeDjDecision } = await import("../brain/dj-brain.js");
    const { buildMockEnvironment } = await import("../utils/mock-environment.js");

    const input = {
      llm: deps.llm,
      now: new Date(),
      systemPrompt: deps.systemPrompt,
      userTaste: deps.userPreferences.taste,
      routines: deps.userPreferences.routines,
      moodRules: deps.userPreferences.moodRules,
      recentMemory: [],
      userMessage: message,
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: buildMockEnvironment(),
    };

    const decision = await computeDjDecision(input);
    const fullText = decision.say;
    const sentences = splitIntoSentences(fullText);

    for (const sentence of sentences) {
      callbacks.sendEvent("chunk", sentence);
    }

    callbacks.sendEvent("done", {
      text: fullText,
      action: undefined,
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/tt/projects/FakeRadio/server && npx vitest run src/http/chat-sse-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Register the SSE route in register-routes.ts**

```typescript
// In register-routes.ts, add after line 185:
// app.post("/api/chat", async (request) => handleChat(request.body, deps));

// SSE chat stream endpoint
app.post("/api/chat/stream", async (request, reply) => {
  const { computeDjDecision } = await import("../brain/dj-brain.js");
  const { buildMockEnvironment } = await import("../utils/mock-environment.js");
  const { ChatRequestSchema } = await import("@fakeradio/shared");
  const parsed = ChatRequestSchema.parse(request.body);

  const chunks: string[] = [];
  let fullText = "";
  let action: { type: string; trackId?: string; title?: string; artist?: string } | undefined;

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event: string, data: string | object) => {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
  };

  try {
    const currentTrack = deps.state.getCurrentTrack();
    const mood = deps.userPreferences.moodRules?.defaultMood ?? "夜行";

    // Intent routing
    if (/^(下一首|next|切歌|换一首)/i.test(parsed.message)) {
      sendEvent("done", { text: "正在切歌...", action: { type: "next-track" } });
      reply.raw.end();
      return;
    }

    if (/^(收藏|喜欢这首歌|加入收藏|fav)/i.test(parsed.message) && currentTrack) {
      const text = `已收藏《${currentTrack.title}》`;
      sendEvent("chunk", text);
      sendEvent("done", { text, action: { type: "add-favorite", trackId: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist } });
      reply.raw.end();
      return;
    }

    // Default: LLM streaming
    const decision = await computeDjDecision({
      llm: deps.llm,
      now: new Date(),
      systemPrompt: deps.systemPrompt,
      userTaste: deps.userPreferences.taste,
      routines: deps.userPreferences.routines,
      moodRules: deps.userPreferences.moodRules,
      recentMemory: [],
      userMessage: parsed.message,
      toolResults: [],
      executionState: currentTrack ? `now playing: ${currentTrack.title}` : "idle",
      environment: buildMockEnvironment(),
    });

    const sentences = decision.say.match(/[^。！？.!?]+[。！？.!?]*/g) || [decision.say];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) sendEvent("chunk", trimmed);
    }
    sendEvent("done", { text: decision.say, action: undefined });

  } catch (err) {
    sendEvent("done", { text: "信号断了。再说一次？", action: undefined });
  }

  reply.raw.end();
});
```

- [ ] **Step 6: Verify server starts and route is registered**

Run: `cd /Users/tt/projects/FakeRadio/server && npx tsx src/http/register-routes.ts` (smoke test - imports OK)
Expected: No import errors

- [ ] **Step 7: Commit**

```bash
git add server/src/http/chat-sse-handler.ts server/src/http/register-routes.ts
git commit -m "feat(server): add POST /api/chat/stream SSE endpoint"
```

---

## Task 2: 前端 SSE 连接管理 hook

**Files:**
- Create: `apps/web/src/features/player/use-chat-sse.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Test: `apps/web/src/features/player/use-chat-sse.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/src/features/player/use-chat-sse.test.ts
import { renderHook, act } from "@testing-library/react";
import { useChatSSE } from "./use-chat-sse";

describe("useChatSSE", () => {
  it("connects to SSE stream on sendMessage", async () => {
    const { result } = renderHook(() => useChatSSE());
    expect(result.current.isConnected).toBe(false);

    // Mock fetch to return SSE stream
    const mockReader = {
      read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };
    global.fetch = vi.fn().mockResolvedValue({
      body: { getReader: () => mockReader },
      ok: true,
    }) as any;

    await act(async () => {
      result.current.sendMessage("你好", { onChunk: vi.fn(), onDone: vi.fn() });
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("cleans up on unmount", () => {
    const { result, unmount } = renderHook(() => useChatSSE());
    unmount();
    // No errors thrown on unmount
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tt/projects/FakeRadio/apps/web && npx vitest run src/features/player/use-chat-sse.test.ts`
Expected: FAIL (file does not exist)

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/features/player/use-chat-sse.ts
"use client";

import { useRef, useState, useCallback } from "react";
import { buildApiUrl } from "../../lib/api-client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  fav?: boolean;
  trackChip?: { title: string; artist: string };
};

export type UseChatSSEOptions = {
  onChunk(text: string): void;
  onDone(data: { text: string; action?: { type: string; trackId?: string; title?: string; artist?: string } }): void;
};

export function useChatSSE() {
  const [isConnected, setIsConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string, opts: UseChatSSEOptions) => {
    // Cancel any existing stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    abortRef.current = new AbortController();
    setIsConnected(true);

    try {
      const response = await fetch(buildApiUrl("/api/chat/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        opts.onDone({ text: "信号断了。再说一次？" });
        setIsConnected(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        opts.onDone({ text: "信号断了。再说一次？" });
        setIsConnected(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              // Determine event type from context - in SSE we get data:chunk or data:done
              // The event type was in the preceding "event:" line
              // We detect based on the payload shape
              if ("text" in parsed && "action" in parsed) {
                opts.onDone(parsed);
              } else if (typeof parsed === "string") {
                opts.onChunk(parsed);
              } else if (parsed.text) {
                opts.onChunk(parsed.text);
              }
            } catch {
              // Raw text chunk
              if (data) opts.onChunk(data);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        opts.onDone({ text: "信号断了。再说一次？" });
      }
    } finally {
      setIsConnected(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { sendMessage, cancel, isConnected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/tt/projects/FakeRadio/apps/web && npx vitest run src/features/player/use-chat-sse.test.ts`
Expected: PASS

- [ ] **Step 5: Add sendChatStream to api-client.ts**

```typescript
// apps/web/src/lib/api-client.ts (add at end)
// Re-export ChatMessage type
export type { ChatMessage };
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/player/use-chat-sse.ts apps/web/src/lib/api-client.ts
git commit -m "feat(web): add useChatSSE hook for SSE chat streaming"
```

---

## Task 3: useRadioBridge Hook

**Files:**
- Create: `apps/web/src/features/player/use-radio-bridge.ts`
- Test: `apps/web/src/features/player/use-radio-bridge.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/src/features/player/use-radio-bridge.test.ts
import { renderHook } from "@testing-library/react";
import { useRadioBridge } from "./use-radio-bridge";

describe("useRadioBridge", () => {
  it("returns a radio state object compatible with skin components", () => {
    const { result } = renderHook(() =>
      useRadioBridge({
        persona: {
          name: "深夜电台",
          short: "阿夜",
          tag: "凌晨 02:14 · MIDNIGHT FM",
          sysPrompt: "你是一个 DJ。",
          moodWords: ["夜行", "灯关一半"],
        },
        track: { id: "t1", title: "夜车", artist: "陈粒", album: "如也", dur: 218, source: "netease" as const, tone: ["#3a2618", "#a4543a", "#f0c89b"] },
        next: { id: "t2", title: "晚安", artist: "蒋先贵", album: "三七地铁", dur: 246, source: "netease" as const, tone: ["#1f1c2e", "#7a5fa3", "#e8c8b0"] },
        playing: true,
        pos: 38,
        vol: 0.72,
        liked: {},
        mood: "夜行",
        messages: [],
        input: "",
        busy: false,
        onSend: vi.fn(),
        onChip: vi.fn(),
        onToggleLike: vi.fn(),
        onSeek: vi.fn(),
        onSkip: vi.fn(),
        onTogglePlay: vi.fn(),
        onVolumeChange: vi.fn(),
      })
    );

    // Must have track, next, playing, pos, vol, liked, mood
    expect(result.current.track).toBeDefined();
    expect(result.current.next).toBeDefined();
    expect(typeof result.current.togglePlay).toBe("function");
    expect(typeof result.current.toggleLike).toBe("function");
    expect(typeof result.current.skip).toBe("function");
    expect(typeof result.current.seek).toBe("function");
    expect(typeof result.current.send).toBe("function");
    expect(typeof result.current.ask).toBe("function");
    expect(typeof result.current.onBubbleAction).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tt/projects/FakeRadio/apps/web && npx vitest run src/features/player/use-radio-bridge.test.ts`
Expected: FAIL (file does not exist)

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/features/player/use-radio-bridge.ts
"use client";

import { useCallback, useState, useRef } from "react";
import { useChatSSE, type ChatMessage } from "./use-chat-sse";
import type { Track } from "@fakeradio/shared";

export type Persona = {
  name: string;
  short: string;
  tag: string;
  sysPrompt: string;
  moodWords: string[];
};

export type RadioBridgeParams = {
  persona: Persona;
  track: Track | null;
  next: Track | null;
  playing: boolean;
  pos: number;
  vol: number;
  liked: Record<string, boolean>;
  mood: string;
  messages: ChatMessage[];
  input: string;
  busy: boolean;
  onSend(text: string): void;
  onChip(prompt: string): void;
  onToggleLike(): void;
  onSeek(pos01: number): void;
  onSkip(direction: number): void;
  onTogglePlay(): void;
  onVolumeChange(vol: number): void;
};

export type RadioState = ReturnType<typeof useRadioBridge> extends { r: infer R } ? R : never;

export function useRadioBridge(params: RadioBridgeParams) {
  const { persona, track, next, playing, pos, vol, liked, mood, messages, input, busy, onSend, onChip, onToggleLike, onSeek, onSkip, onTogglePlay, onVolumeChange } = params;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const [chatInput, setChatInput] = useState(input);
  const [isBusy, setIsBusy] = useState(busy);
  const [likedState, setLikedState] = useState(liked);
  const seededFor = useRef<string | null>(null);
  const chatSSE = useChatSSE();

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const ask = useCallback(async (userText: string, opts?: { silentUser?: boolean }) => {
    if (isBusy) return;

    const userMsg: ChatMessage = { id: "u" + Date.now(), role: "user", text: userText };
    const aId = "a" + Date.now() + "x";
    const aMsg: ChatMessage = { id: aId, role: "assistant", text: "", streaming: true };

    setChatMessages((m) => opts?.silentUser ? [...m, aMsg] : [...m, userMsg, aMsg]);
    setIsBusy(true);

    let fullText = "";

    chatSSE.sendMessage(userText, {
      onChunk: (text) => {
        fullText += text;
        setChatMessages((m) =>
          m.map((x) =>
            x.id === aId ? { ...x, text: fullText, streaming: true } : x
          )
        );
      },
      onDone: (data) => {
        fullText = data.text;
        setChatMessages((m) =>
          m.map((x) =>
            x.id === aId ? { ...x, text: data.text, streaming: false } : x
          )
        );
        setIsBusy(false);

        // Execute action if present
        if (data.action?.type === "next-track") {
          onSkip(1);
        } else if (data.action?.type === "add-favorite" && track) {
          onToggleLike();
        }
      },
    });
  }, [isBusy, chatSSE, onSkip, onToggleLike, track]);

  const send = useCallback((override?: string) => {
    const v = (override !== undefined ? override : chatInput).trim();
    if (!v) return;
    setChatInput("");
    ask(v);
  }, [chatInput, ask]);

  const onBubbleAction = useCallback((kind: string, msg: ChatMessage) => {
    if (kind === "fav") {
      setChatMessages((m) => m.map((x) => x.id === msg.id ? { ...x, fav: !x.fav } : x));
    } else if (kind === "more") {
      ask("刚才那段再展开点说。", { silentUser: true });
    } else if (kind === "less") {
      ask("太长了,给我一句话总结。", { silentUser: true });
    } else if (kind === "copy") {
      navigator.clipboard?.writeText(msg.text);
    }
  }, [ask]);

  const r = {
    track: track!,
    next: next!,
    playing,
    pos,
    vol,
    liked: likedState,
    mood,
    messages: chatMessages,
    input: chatInput,
    busy: isBusy,
    setVol: onVolumeChange,
    togglePlay: onTogglePlay,
    skip: onSkip,
    seek: onSeek,
    toggleLike: () => {
      setLikedState((l) => ({ ...l, [track?.id ?? ""]: !l[track?.id ?? ""] }));
      onToggleLike();
    },
    messages: chatMessages,
    input: chatInput,
    busy: isBusy,
    setInput: setChatInput,
    send,
    onChip,
    ask,
    onBubbleAction,
    seedReset: () => { seededFor.current = null; },
  };

  return { r, chatMessages, chatInput, isBusy, setChatInput, chatSSE };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/tt/projects/FakeRadio/apps/web && npx vitest run src/features/player/use-radio-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/player/use-radio-bridge.ts
git commit -m "feat(web): add useRadioBridge hook"
```

---

## Task 4: 皮肤配置文件

**Files:**
- Create: `apps/web/src/features/player/skin-config.ts`

- [ ] **Step 1: Create skin config file**

```typescript
// apps/web/src/features/player/skin-config.ts

export type SkinId = "amber" | "pixel" | "terminal" | "bento" | "y2k";

export type PersonaId = "midnight" | "morning" | "buddy" | "cool";

export const PERSONAS: Record<PersonaId, {
  name: string;
  short: string;
  tag: string;
  sysPrompt: string;
  moodWords: string[];
}> = {
  midnight: {
    name: "深夜电台",
    short: "阿夜",
    tag: "凌晨 02:14 · MIDNIGHT FM",
    sysPrompt: "你是一档深夜电台的 DJ，名字叫『阿夜』。说话低声、慢、留白多，常常半句话就停。会把当下的曲目、夜的温度、听众的情绪揉在一起讲。每次回复 1–3 句中文，不超过 60 字，不用列点，不用 emoji，不要写『主持人：』之类的前缀。",
    moodWords: ["夜行", "灯关一半", "潮汐", "尾气", "凌晨蓝"],
  },
  morning: {
    name: "清晨陪伴",
    short: "晓",
    tag: "早上 07:02 · DAYBREAK FM",
    sysPrompt: "你是一档清晨电台的 DJ，名字叫『晓』。语气温柔、明亮、轻快，像把一杯热的递过来。每次 1–3 句中文，不超过 60 字，不用列点，不用 emoji。",
    moodWords: ["晨雾", "热豆浆", "通勤", "薄阳", "刚睁眼"],
  },
  buddy: {
    name: "话痨好友",
    short: "搭子",
    tag: "下午 03:48 · LIVING ROOM",
    sysPrompt: "你是听众的好友，碎碎念地聊天，像在对方客厅里。语气松、口语、可以自嘲。每次 1–3 句中文，不超过 70 字，不要 emoji，不要前缀。",
    moodWords: ["午后犯困", "沙发塌陷", "外卖刚到", "随便聊", "懒"],
  },
  cool: {
    name: "极简冷淡",
    short: "STATIC",
    tag: "深夜 23:58 · STATIC",
    sysPrompt: "你是一档极简电台的 DJ。一两句话即可，冷淡、克制、留白。中文，不超过 30 字，不用 emoji，不要前缀。",
    moodWords: ["低噪", "极简", "白光", "无人", "电流"],
  },
};

export const SKINS: Record<SkinId, { label: string }> = {
  amber: { label: "暖橙胶片 (默认)" },
  pixel: { label: "像素 Game Boy" },
  terminal: { label: "终端 TUI" },
  bento: { label: "Bento 玻璃" },
  y2k: { label: "Y2K / Win98" },
};

export const QUICK_PROMPTS = [
  { label: "换一首", prompt: "帮我换一首,差不多的氛围就行。" },
  { label: "我想听安静的", prompt: "想听更安静的,不要鼓。" },
  { label: "降速", prompt: "我有点累了,节奏放慢点。" },
  { label: "讲讲这首", prompt: "讲讲这首歌的感觉。" },
  { label: "晚安", prompt: "我准备睡了,最后说点什么。" },
];

export function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/player/skin-config.ts
git commit -m "feat(web): add skin config with PERSONAS, SKINS, QUICK_PROMPTS"
```

---

## Task 5: Amber 皮肤组件（参考实现）

**Files:**
- Create: `apps/web/src/features/player/skin-amber.tsx`

This is the most complex skin. See FakeRadio-frontend/skin-amber.jsx for reference.
The component receives `{ r, persona, avatarSrc, onAvatarClick }` props.

```typescript
// apps/web/src/features/player/skin-amber.tsx
"use client";

import type { FormEvent } from "react";
import { useRef, useEffect, useState } from "react";
import { PERSONAS, QUICK_PROMPTS, fmt, type Persona, type SkinId } from "./skin-config";
import type { RadioState } from "./use-radio-bridge";

export type SkinAmberProps = {
  r: RadioState;
  persona: Persona;
  avatarSrc: string | null;
  onAvatarClick: () => void;
  theme: SkinId;
  onThemeChange: (theme: SkinId) => void;
  onPersonaChange: (personaId: string) => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
};

// Cover art SVG component (from radio-core.jsx)
function CoverArt({ track, playing }: { track: { id: string; tone: string[] }; playing: boolean }) {
  const [a, b, c] = track.tone;
  return (
    <div className="fr-cover" aria-hidden>
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <radialGradient id={`g-${track.id}`} cx="35%" cy="30%" r="90%">
            <stop offset="0%" stopColor={c} />
            <stop offset="55%" stopColor={b} />
            <stop offset="100%" stopColor={a} />
          </radialGradient>
          <filter id={`n-${track.id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed={track.id.charCodeAt(1)} />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.32 0" />
          </filter>
        </defs>
        <rect width="200" height="200" fill={`url(#g-${track.id})`} />
        {[88, 76, 64, 52, 40, 28].map((r, i) =>
          <circle key={i} cx="100" cy="108" r={r} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        )}
        <circle cx="100" cy="108" r="14" fill={a} stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
        <circle cx="100" cy="108" r="2.2" fill={c} />
        <rect width="200" height="200" filter={`url(#n-${track.id})`} opacity="0.55" />
      </svg>
      <div className={"fr-cover-spin " + (playing ? "on" : "")} />
    </div>
  );
}

function WaveAvatar({ active, size = 34, className = "fr-wave" }: { active?: boolean; size?: number; className?: string }) {
  const bars = 5;
  return (
    <div className={className} style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: bars }).map((_, i) =>
        <span key={i} className={active ? "on" : ""} style={{ animationDelay: `${i * 90}ms` }} />
      )}
    </div>
  );
}

function Bubble({ msg, onAction, avatarSrc, onAvatarClick }: {
  msg: { id: string; role: string; text: string; streaming?: boolean; fav?: boolean; trackChip?: { title: string; artist: string } };
  onAction: (kind: string, msg: any) => void;
  avatarSrc: string | null;
  onAvatarClick: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => { t.current = setTimeout(() => setMenu(true), 480); };
  const cancel = () => { if (t.current) clearTimeout(t.current); };
  const isUser = msg.role === "user";

  return (
    <div className={"fr-bubble-row " + (isUser ? "u" : "a")}>
      {!isUser && (
        <button type="button" onClick={onAvatarClick} title="点击上传照片做 DJ 头像"
          style={{ appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer", borderRadius: "50%", display: "inline-flex" }}>
          {avatarSrc
            ? <img className="fr-dj-avatar" src={avatarSrc} alt="dj" />
            : <WaveAvatar active={msg.streaming} size={28} />}
        </button>
      )}
      <div className="fr-bubble-wrap">
        <div
          className={"fr-bubble " + (isUser ? "u" : "a") + (msg.fav ? " fav" : "")}
          onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
          onTouchStart={start} onTouchEnd={cancel}
          onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        >
          {msg.text}
          {msg.streaming && <span className="fr-caret" />}
          {msg.trackChip && (
            <div className="fr-chip-track">
              <span className="fr-dot" /> 正在播 · {msg.trackChip.title} — {msg.trackChip.artist}
            </div>
          )}
          {msg.fav && <div className="fr-fav-mark">★ 已收藏</div>}
        </div>
        {menu && (
          <div className="fr-bub-menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => { onAction("fav", msg); setMenu(false); }}>{msg.fav ? "取消收藏" : "收藏这条"}</button>
            <button onClick={() => { onAction("more", msg); setMenu(false); }}>多说点</button>
            <button onClick={() => { onAction("less", msg); setMenu(false); }}>太长了</button>
            <button onClick={() => { onAction("copy", msg); setMenu(false); }}>复制</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkinAmber({ r, persona, avatarSrc, onAvatarClick, theme, onThemeChange, onPersonaChange, onAvatarUpload, onAvatarRemove }: SkinAmberProps) {
  const { track, playing, pos, vol, liked, mood, togglePlay, skip, seek, toggleLike, messages, input, busy, setInput, send, onChip, onBubbleAction } = r;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!track) return <div className="fr-frame fr-amber" data-screen-label="01 Amber">Loading...</div>;

  return (
    <div className="fr-frame fr-amber" data-screen-label="01 Amber">
      <section className="fr-player">
        <div className="fr-player-bg" aria-hidden>
          <CoverArt track={track} playing={playing} />
          <div className="fr-player-veil" />
          <div className="fr-player-grain" />
        </div>
        <div className="fr-player-fg">
          <div className="fr-player-top">
            <div className="fr-badge"><span className="fr-led" /> FAKERADIO</div>
          </div>
          <div className="fr-player-mid">
            <div className="fr-cover-mini"><CoverArt track={track} playing={playing} /></div>
            <div className="fr-meta">
              <div className="fr-title">{track.title}</div>
              <div className="fr-artist">{track.artist} · {track.album}</div>
            </div>
          </div>
          <div className="fr-progress" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - r.left) / r.width);
          }}>
            <div className="fr-bar"><div className="fr-fill" style={{ width: pos / track.dur * 100 + "%" }} /></div>
            <div className="fr-times"><span>{fmt(pos)}</span><span>{fmt(track.dur)}</span></div>
          </div>
          <div className="fr-controls">
            <button className={"fr-ctl fr-heart " + (liked[track.id] ? "on" : "")} onClick={toggleLike}>
              {liked[track.id] ? "♥" : "♡"}
            </button>
            <button className="fr-ctl" onClick={() => skip(-1)}>⏮</button>
            <button className="fr-ctl fr-big" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
            <button className="fr-ctl" onClick={() => skip(1)}>⏭</button>
            <div className="fr-vol">
              <span>♪</span>
              <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => r.setVol(parseFloat(e.target.value))} />
            </div>
          </div>
        </div>
      </section>

      <section className="fr-chat">
        <div className="fr-chat-tape">
          <span className="fr-tape-led" />
          <span className="fr-tape-mood">{mood} · {persona.tag.split(" · ")[1]}</span>
          <span className="fr-tape-status">{busy ? "SYNTHESIZING…" : "ON AIR"}</span>
        </div>
        <div className="fr-chat-body" ref={scrollRef}>
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} onAction={onBubbleAction} avatarSrc={avatarSrc} onAvatarClick={onAvatarClick} />
          ))}
          {busy && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="fr-typing"><span /><span /><span /></div>
          )}
        </div>
        <div className="fr-chips">
          {QUICK_PROMPTS.map((q, i) => (
            <button key={i} className="fr-chip" onClick={() => onChip(q.prompt)} disabled={busy}>{q.label}</button>
          ))}
        </div>
        <form className="fr-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={busy ? "DJ 正在说话…" : "对 DJ 说点什么"} disabled={busy} />
          <button type="submit" className="fr-send" disabled={busy || !input.trim()}>发送</button>
        </form>
      </section>

      <div className="fr-frame-grain" aria-hidden />
      <div className="fr-frame-vignette" aria-hidden />
      <div className="fr-frame-scan" aria-hidden />
    </div>
  );
}
```

---

## Task 6: 其他 4 套皮肤组件

**Files:**
- Create: `apps/web/src/features/player/skin-pixel.tsx`
- Create: `apps/web/src/features/player/skin-terminal.tsx`
- Create: `apps/web/src/features/player/skin-bento.tsx`
- Create: `apps/web/src/features/player/skin-y2k.tsx`

Each follows the same pattern as SkinAmber but with different CSS classes and layout.
Full implementations follow the FakeRadio-frontend source files.

---

## Task 7: 皮肤 CSS（集中管理）

**Files:**
- Create: `apps/web/src/features/player/skins.css`

Copy all styles from FakeRadio-frontend/styles.css and apply `.fr-*` prefix globally.
Then import in globals.css.

---

## Task 8: player-view-model.ts 扩展

**Modify:** `apps/web/src/features/player/player-view-model.ts`

- [ ] **Step 1: Update ON_AIR_THEMES**

```typescript
// Line ~183-185, change from:
export const ON_AIR_THEMES = ["terminal-fm", "morning-console"] as const;
export type OnAirThemeId = (typeof ON_AIR_THEMES)[number];

// To:
export const ON_AIR_THEMES = ["terminal-fm", "morning-console", "amber", "pixel", "terminal", "bento", "y2k"] as const;
export type OnAirThemeId = (typeof ON_AIR_THEMES)[number];

// Also update getThemeLabel:
export function getThemeLabel(theme: OnAirThemeId): string {
  const labels: Record<OnAirThemeId, string> = {
    "terminal-fm": "Terminal FM",
    "morning-console": "Morning Console",
    "amber": "暖橙胶片",
    "pixel": "像素 Game Boy",
    "terminal": "终端 TUI",
    "bento": "Bento 玻璃",
    "y2k": "Y2K / Win98",
  };
  return labels[theme];
}
```

---

## Task 9: player-shell.tsx 集成

**Modify:** `apps/web/src/features/player/player-shell.tsx`

Changes:
- Add `avatarSrc` state
- Add `selectedPersona` state
- Add `showSettings` state
- Replace `OnAirTerminal` with conditional rendering: settings panel OR active skin component
- Integrate `useRadioBridge`

---

## Task 10: layout.tsx 字体加载

**Modify:** `apps/web/src/app/layout.tsx`

Add Google Fonts link tags for all 6 font families used by the skins.

---

## 验证目标

1. `npm run build` 在 apps/web 和 server 两个包都通过
2. `npm run test` 所有新增测试通过
3. 5 套皮肤全部可切换，播放控制正常
4. 聊天 SSE 流式响应正常，逐句打印效果可见
5. 头像上传 localStorage 持久化正常
6. 主题偏好 localStorage 持久化正常（刷新后保持选择）
7. 快捷按钮（换一首/降速等）正常触发聊天
