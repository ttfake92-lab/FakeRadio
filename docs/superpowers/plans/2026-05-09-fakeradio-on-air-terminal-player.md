# FakeRadio On Air Terminal Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 FakeRadio 首页从传统播放器面板重排为 `9:16` 自适应的 AI DJ `On Air` 终端，并落地 `Terminal FM` 与 `Morning Console` 两个主题。

**Architecture:** 保留现有 `PlayerShell` 的数据加载、播放、收藏、聊天和 stream orchestration，把显示层拆成 `OnAirTerminal` 组件。纯展示派生逻辑放进 `player-view-model.ts` 并用 Vitest 覆盖；比例、主题和终端视觉放进 `globals.css`，不改变 server、adapter 或 shared contract。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、CSS `aspect-ratio` / `svh` / CSS variables、现有 Browser 验证流程。

---

## Scope Check

本计划只实现设计文档中的默认 `On Air` 常驻页和首批两个主题。`Modes`、`Memory`、`Signals`、`Setup` 本轮只保留导航入口或二级入口语义，不实现完整页面。网易云登录、故事来源详情、provider 诊断仍保留在代码状态里，但不再平铺在默认首页。

## File Structure

- Modify: `apps/web/src/features/player/player-view-model.ts`
  - 新增 `OnAirThemeId`、主题元信息、时间/日期/mode/连接/队列/文本派生 helper。
- Modify: `apps/web/src/features/player/player-view-model.test.ts`
  - 覆盖主题列表、时间格式、模式标签、连接状态、DJ 文案 fallback、队列数量。
- Create: `apps/web/src/features/player/on-air-terminal.tsx`
  - 纯展示组件。接收当前曲目、DJ 文案、播放状态、队列数量、主题、输入状态和事件 handler。
- Modify: `apps/web/src/features/player/player-shell.tsx`
  - 保留现有 hook 与 handler，把原本平铺 JSX 替换为 `OnAirTerminal`。
- Modify: `apps/web/src/app/globals.css`
  - 新增 `9:16` 自适应 stage/panel、默认 `Terminal FM` 主题、`Morning Console` 主题和终端子区块样式。

## Task 1: Add On Air View-Model Helpers

**Files:**
- Modify: `apps/web/src/features/player/player-view-model.ts`
- Modify: `apps/web/src/features/player/player-view-model.test.ts`

- [ ] **Step 1: Write failing tests for themes and display helpers**

Extend the existing `apps/web/src/features/player/player-view-model.test.ts` import from `./player-view-model` with these names:

```ts
import {
  buildOnAirClock,
  getConnectionLabel,
  getDjMessageText,
  getOnAirModeLabel,
  getQueueCountLabel,
  getThemeLabel,
  ON_AIR_THEMES
} from "./player-view-model";
```

Add this test block after the existing `player view model` describe block:

```ts
describe("on air terminal view model", () => {
  it("defines terminal and morning theme labels", () => {
    expect(ON_AIR_THEMES).toEqual(["terminal-fm", "morning-console"]);
    expect(getThemeLabel("terminal-fm")).toBe("Terminal FM");
    expect(getThemeLabel("morning-console")).toBe("Morning Console");
  });

  it("formats on air clock for the terminal header", () => {
    const clock = buildOnAirClock(new Date("2026-04-20T13:11:00.000Z"), "UTC");

    expect(clock.time).toBe("13:11");
    expect(clock.weekday).toBe("Monday");
    expect(clock.date).toBe("20·APR·2026");
  });

  it("maps hour of day to an on air mode label", () => {
    expect(getOnAirModeLabel(8)).toBe("Morning");
    expect(getOnAirModeLabel(10)).toBe("Focus");
    expect(getOnAirModeLabel(15)).toBe("Afternoon");
    expect(getOnAirModeLabel(22)).toBe("Night");
  });

  it("labels queue count in the reference layout language", () => {
    expect(getQueueCountLabel(0)).toBe("0 TRACKS");
    expect(getQueueCountLabel(3)).toBe("3 TRACKS");
  });

  it("uses stream status to produce a compact connection label", () => {
    expect(getConnectionLabel("connected")).toBe("CONNECTED");
    expect(getConnectionLabel("connecting")).toBe("CONNECTING");
    expect(getConnectionLabel("disconnected")).toBe("OFFLINE");
  });

  it("prefers live DJ text and falls back to a calm on air message", () => {
    expect(getDjMessageText("  现在进入写代码专注模式。  ")).toBe("现在进入写代码专注模式。");
    expect(getDjMessageText("")).toBe("FakeRadio 已连接。告诉 DJ 你想进入什么状态。");
    expect(getDjMessageText(undefined)).toBe("FakeRadio 已连接。告诉 DJ 你想进入什么状态。");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @fakeradio/web test -- player-view-model.test.ts
```

Expected: FAIL with missing exports such as `ON_AIR_THEMES` or `buildOnAirClock`.

- [ ] **Step 3: Implement minimal helpers**

Append this code to `apps/web/src/features/player/player-view-model.ts` after `shouldStartCrossfade`:

```ts
export const ON_AIR_THEMES = ["terminal-fm", "morning-console"] as const;

export type OnAirThemeId = (typeof ON_AIR_THEMES)[number];

export type OnAirClock = {
  time: string;
  weekday: string;
  date: string;
};

export type StreamConnectionState = "connected" | "connecting" | "disconnected";

export function getThemeLabel(theme: OnAirThemeId): string {
  const labels: Record<OnAirThemeId, string> = {
    "terminal-fm": "Terminal FM",
    "morning-console": "Morning Console"
  };
  return labels[theme];
}

export function buildOnAirClock(date: Date, timeZone?: string): OnAirClock {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone
  });
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    timeZone
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone
  });
  const yearFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone
  });

  return {
    time: timeFormatter.format(date),
    weekday: weekdayFormatter.format(date),
    date: `${dayFormatter.format(date)}·${monthFormatter.format(date).toUpperCase()}·${yearFormatter.format(date)}`
  };
}

export function getOnAirModeLabel(hour: number): string {
  if (hour >= 7 && hour < 9) return "Morning";
  if (hour >= 9 && hour < 12) return "Focus";
  if (hour >= 14 && hour < 18) return "Afternoon";
  if (hour >= 21 || hour < 7) return "Night";
  return "On Air";
}

export function getQueueCountLabel(count: number): string {
  return `${count} ${count === 1 ? "TRACK" : "TRACKS"}`;
}

export function getConnectionLabel(state: StreamConnectionState): string {
  const labels: Record<StreamConnectionState, string> = {
    connected: "CONNECTED",
    connecting: "CONNECTING",
    disconnected: "OFFLINE"
  };
  return labels[state];
}

export function getDjMessageText(message: string | undefined): string {
  const trimmed = message?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : "FakeRadio 已连接。告诉 DJ 你想进入什么状态。";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @fakeradio/web test -- player-view-model.test.ts
```

Expected: PASS for all tests in `player-view-model.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/player/player-view-model.ts apps/web/src/features/player/player-view-model.test.ts
git commit -m "feat(web): add on air terminal view model"
```

## Task 2: Create the On Air Terminal Component

**Files:**
- Create: `apps/web/src/features/player/on-air-terminal.tsx`
- Modify: `apps/web/src/features/player/player-shell.tsx`

- [ ] **Step 1: Create the component file with typed props**

Create `apps/web/src/features/player/on-air-terminal.tsx`:

```tsx
"use client";

import type { FormEvent } from "react";
import type { OnAirClock, OnAirThemeId } from "./player-view-model";

export type OnAirTerminalProps = {
  theme: OnAirThemeId;
  clock: OnAirClock;
  modeLabel: string;
  connectionLabel: string;
  currentTrackTitle: string;
  currentTrackArtist: string;
  playbackLabel: string;
  progressLabel: string;
  durationLabel: string;
  queueCountLabel: string;
  djName: string;
  djMessage: string;
  messageTimeLabel: string;
  nowPlayingLabel: string;
  chatMessage: string;
  isActing: boolean;
  isFavorited: boolean;
  onPlay(): void;
  onNext(): void;
  onToggleFavorite(): void;
  onChatMessageChange(value: string): void;
  onSubmitChat(event: FormEvent<HTMLFormElement>): void;
};

export function OnAirTerminal({
  theme,
  clock,
  modeLabel,
  connectionLabel,
  currentTrackTitle,
  currentTrackArtist,
  playbackLabel,
  progressLabel,
  durationLabel,
  queueCountLabel,
  djName,
  djMessage,
  messageTimeLabel,
  nowPlayingLabel,
  chatMessage,
  isActing,
  isFavorited,
  onPlay,
  onNext,
  onToggleFavorite,
  onChatMessageChange,
  onSubmitChat
}: OnAirTerminalProps) {
  return (
    <main className={`on-air-stage theme-${theme}`} aria-label="FakeRadio On Air">
      <section className="on-air-panel" aria-labelledby="on-air-title">
        <header className="on-air-topbar">
          <div className="on-air-brand-lockup">
            <span className="on-air-avatar" aria-hidden="true" />
            <a id="on-air-title" className="on-air-brand" href="/">FakeRadio</a>
          </div>
          <nav className="on-air-top-actions" aria-label="FakeRadio status actions">
            <a href="/settings">LOGIN</a>
            <button type="button" aria-pressed={theme === "terminal-fm"}>DARK</button>
            <button type="button" aria-pressed={theme === "morning-console"}>LIGHT</button>
          </nav>
        </header>

        <section className="on-air-clock" aria-label="On Air status">
          <span className="on-air-clock-marker" aria-hidden="true">I</span>
          <p className="on-air-time">{clock.time}</p>
          <p className="on-air-weekday">{clock.weekday}</p>
          <p className="on-air-date">{clock.date}</p>
          <p className="on-air-live"><span aria-hidden="true">●</span> ON AIR · {modeLabel}</p>
        </section>

        <section className="on-air-play-strip" aria-label="Now playing">
          <div className="on-air-track-meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="on-air-track-copy">
            <p>{currentTrackTitle} · {currentTrackArtist}</p>
            <small>{playbackLabel}</small>
          </div>
          <div className="on-air-controls" aria-label="Playback controls">
            <button type="button" onClick={onNext} disabled={isActing} aria-label="上一段">◀</button>
            <button type="button" onClick={onPlay} disabled={isActing} aria-label="播放或暂停">Ⅱ</button>
            <button type="button" onClick={onNext} disabled={isActing} aria-label="下一段">▶</button>
            <button type="button" onClick={onToggleFavorite} disabled={isActing} aria-label={isFavorited ? "取消收藏" : "收藏"}>
              {isFavorited ? "♥" : "♡"}
            </button>
          </div>
          <div className="on-air-progress">
            <span>{progressLabel}</span>
            <div aria-hidden="true"><span /></div>
            <span>{durationLabel}</span>
          </div>
        </section>

        <section className="on-air-queue-strip" aria-label="Queue summary">
          <span>QUEUE</span>
          <span>{queueCountLabel}</span>
        </section>

        <section className="on-air-dj-room" aria-label="AI DJ live room">
          <header>
            <p><span aria-hidden="true">●</span> {djName}</p>
            <span>LIVE</span>
          </header>
          <p className="on-air-server-line">Connected to FakeRadio server</p>
          <article className="on-air-message">
            <span className="on-air-message-avatar" aria-hidden="true" />
            <div>
              <p className="on-air-message-author">{djName.toUpperCase()}</p>
              <div className="on-air-message-bubble">{djMessage}</div>
              <p className="on-air-message-meta">{messageTimeLabel} <button type="button">▶ REPLAY</button></p>
              <p className="on-air-now-playing">{nowPlayingLabel}</p>
            </div>
          </article>
        </section>

        <form className="on-air-input-bar" onSubmit={onSubmitChat}>
          <label className="sr-only" htmlFor="on-air-chat">Tell the DJ</label>
          <textarea
            id="on-air-chat"
            value={chatMessage}
            onChange={(event) => onChatMessageChange(event.target.value)}
            placeholder="Say something to the DJ..."
            rows={1}
          />
          <button type="button" aria-label="Voice input">◉</button>
          <button type="submit" disabled={isActing || chatMessage.trim().length === 0} aria-label="Send to DJ">↑</button>
        </form>

        <footer className="on-air-footer">
          <span>FAKERADIO FM</span>
          <span>{connectionLabel}</span>
        </footer>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Import the component in `PlayerShell` without rendering it yet**

Add this import to `apps/web/src/features/player/player-shell.tsx`:

```ts
import { OnAirTerminal } from "./on-air-terminal";
```

Do not replace the JSX in this step.

- [ ] **Step 3: Run typecheck to verify the new component compiles**

Run:

```bash
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/player/on-air-terminal.tsx apps/web/src/features/player/player-shell.tsx
git commit -m "feat(web): add on air terminal component"
```

## Task 3: Wire PlayerShell to the On Air Terminal

**Files:**
- Modify: `apps/web/src/features/player/player-shell.tsx`

- [ ] **Step 1: Add derived On Air display values**

Update the `player-view-model` import in `player-shell.tsx` to include:

```ts
  buildOnAirClock,
  getConnectionLabel,
  getDjMessageText,
  getOnAirModeLabel,
  getQueueCountLabel
```

Add these derived values after the `isFavorited` declaration:

```ts
  const nowDate = useMemo(() => new Date(), []);
  const onAirClock = useMemo(() => buildOnAirClock(nowDate), [nowDate]);
  const onAirModeLabel = useMemo(() => getOnAirModeLabel(nowDate.getHours()), [nowDate]);
  const onAirConnectionLabel = getConnectionLabel(
    streamStatus.label === "已连接" ? "connected" : streamStatus.label === "连接中" ? "connecting" : "disconnected"
  );
  const currentTrackTitle = playback.episodeData?.track.title ?? track?.title ?? "Waiting for signal";
  const currentTrackArtist = playback.episodeData?.track.artist ?? track?.artist ?? "FakeRadio";
  const currentPlaybackLabel = playback.episodeState !== "idle" ? playback.episodeStateLabel : playbackLabel;
  const djMessage = getDjMessageText(now?.dj.say ?? playback.episodeData?.story.text ?? chatReply?.message);
  const queueCountLabel = getQueueCountLabel(now?.queue?.length ?? 0);
  const nowPlayingLabel = `Now playing: ${currentTrackTitle} · ${currentTrackArtist}`;
```

- [ ] **Step 2: Replace the returned JSX with `OnAirTerminal`**

Replace the existing `return (` block in `PlayerShell` with:

```tsx
  return (
    <>
      <OnAirTerminal
        theme="terminal-fm"
        clock={onAirClock}
        modeLabel={onAirModeLabel}
        connectionLabel={onAirConnectionLabel}
        currentTrackTitle={currentTrackTitle}
        currentTrackArtist={currentTrackArtist}
        playbackLabel={currentPlaybackLabel}
        progressLabel="0:17"
        durationLabel={formatDuration(playback.episodeData?.track.durationMs ?? track?.durationMs)}
        queueCountLabel={queueCountLabel}
        djName="FakeRadio"
        djMessage={playback.error ?? (shouldWarn ? "当前音乐来源已回退到 mock，本地真实 provider 暂不可用。" : djMessage)}
        messageTimeLabel={onAirClock.time}
        nowPlayingLabel={nowPlayingLabel}
        chatMessage={chatMessage}
        isActing={isActing || isLoading}
        isFavorited={isFavorited}
        onPlay={playback.playEpisode}
        onNext={handleNext}
        onToggleFavorite={handleToggleFavorite}
        onChatMessageChange={setChatMessage}
        onSubmitChat={handleChat}
      />
      <audio
        ref={audio.musicRef}
        className="audio-control-hidden"
        controls={false}
        preload="none"
        src={buildMediaUrl(playback.episodeData?.track.audioUrl ?? track?.audioUrl)}
      />
      <audio ref={audio.speechRef} preload="auto" style={{ display: "none" }} />
    </>
  );
```

- [ ] **Step 3: Remove unused code from `player-shell.tsx`**

Remove unused state and imports after the JSX replacement:

```ts
TasteResponse
TodayPlanResponse
NeteaseLoginStatus
NeteaseQrLoginChallenge
getTaste
getTodayPlan
getNeteaseLoginStatus
createNeteaseQrLogin
checkNeteaseQrLogin
submitNeteaseCookie
getProviderStatusLabel
getSourceKindLabel
getStorySourceDescription
getStoryTypeLabel
getTrackSourceLabel
```

Remove the state variables that only powered the old flat panels:

```ts
const [taste, setTaste] = useState<TasteResponse | null>(null);
const [plan, setPlan] = useState<TodayPlanResponse | null>(null);
const [neteaseLogin, setNeteaseLogin] = useState<NeteaseLoginStatus | null>(null);
const [neteaseQr, setNeteaseQr] = useState<NeteaseQrLoginChallenge | null>(null);
const [neteaseMessage, setNeteaseMessage] = useState("");
const [neteaseCookieInput, setNeteaseCookieInput] = useState("");
const neteaseQrCheckBusy = useRef(false);
const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

Remove the old Netease login handlers by deleting the complete declarations named:

```ts
stopQrPolling
pollQrOnce
handleCreateNeteaseQr
handleCheckNeteaseQr
handleSubmitCookie
```

Also remove the cleanup effect that only calls `stopQrPolling`:

```ts
  useEffect(() => {
    return () => stopQrPolling();
  }, [stopQrPolling]);
```

Update `loadDashboard` to only fetch values used by `OnAirTerminal`:

```ts
  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, healthResponse, favoritesResponse] = await Promise.all([
        getNow(), getHealth(), getFavorites()
      ]);
      setNow(nowResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
    } catch (loadError) {
      playback.setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);
```

Remove `handleRefresh`; the first On Air implementation has no visible refresh control.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS with no unused import or type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/player/player-shell.tsx
git commit -m "feat(web): render on air terminal shell"
```

## Task 4: Add 9:16 Terminal FM CSS

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add accessible hidden utility and reset for the new shell**

Append this to `apps/web/src/app/globals.css`:

```css
.sr-only {
  block-size: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.audio-control-hidden {
  display: none;
}
```

- [ ] **Step 2: Add 9:16 stage and panel styles**

Append:

```css
.on-air-stage {
  align-items: center;
  background:
    radial-gradient(circle at 50% 0%, rgba(64, 69, 110, 0.34), transparent 34%),
    #07080d;
  display: grid;
  justify-items: center;
  min-height: 100svh;
  padding: 12px;
}

.on-air-panel {
  aspect-ratio: 9 / 16;
  border: 1px solid rgba(95, 96, 145, 0.42);
  border-radius: 18px;
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.55);
  color: var(--on-air-text);
  container-type: size;
  display: grid;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  grid-template-rows: 9% 25% 14.4% 5.4% minmax(0, 1fr) 10% 4.8%;
  max-height: calc(100svh - 24px);
  overflow: hidden;
  width: min(calc(100vw - 24px), calc((100svh - 24px) * 9 / 16), 430px);
}
```

- [ ] **Step 3: Add Terminal FM theme variables**

Append:

```css
.theme-terminal-fm {
  --on-air-accent: #45d9bd;
  --on-air-bg: #08090d;
  --on-air-border: rgba(255, 255, 255, 0.08);
  --on-air-muted: #777785;
  --on-air-panel: rgba(22, 23, 32, 0.72);
  --on-air-panel-strong: #020307;
  --on-air-text: #f3f0ea;
  --on-air-top: rgba(46, 47, 73, 0.88);
}

.theme-terminal-fm .on-air-panel {
  background:
    linear-gradient(rgba(28, 30, 50, 0.92), rgba(28, 30, 50, 0.92)),
    radial-gradient(circle, rgba(88, 92, 142, 0.85) 1px, transparent 1px);
  background-size: auto, 11px 11px;
}
```

- [ ] **Step 4: Add section styles**

Append:

```css
.on-air-topbar {
  align-items: center;
  background: var(--on-air-top);
  border-bottom: 1px solid var(--on-air-border);
  display: flex;
  justify-content: space-between;
  min-width: 0;
  padding: 0 5%;
}

.on-air-brand-lockup,
.on-air-top-actions,
.on-air-controls,
.on-air-progress,
.on-air-input-bar,
.on-air-footer {
  align-items: center;
  display: flex;
}

.on-air-avatar,
.on-air-message-avatar {
  background: linear-gradient(135deg, #f2ddb7, var(--on-air-accent) 60%, #27314f);
  border-radius: 999px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18);
  flex: 0 0 auto;
}

.on-air-avatar {
  height: clamp(20px, 7cqw, 30px);
  width: clamp(20px, 7cqw, 30px);
}

.on-air-brand {
  font-size: clamp(1.4rem, 8cqw, 2.1rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  margin-left: 10px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.16);
}

.on-air-top-actions {
  gap: 7px;
}

.on-air-top-actions a,
.on-air-top-actions button {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid transparent;
  border-radius: 999px;
  color: #b8b4bd;
  font-size: clamp(0.55rem, 2.8cqw, 0.78rem);
  font-weight: 900;
  min-height: 0;
  padding: 0.55em 0.8em;
}

.on-air-top-actions button[aria-pressed="true"] {
  background: #f1f0f4;
  border-radius: 2px;
  color: #181923;
}

.on-air-clock {
  background:
    linear-gradient(rgba(1, 2, 8, 0.94), rgba(1, 2, 8, 0.94)),
    radial-gradient(circle, rgba(70, 76, 126, 0.75) 1px, transparent 1px);
  background-size: auto, 11px 11px;
  border-bottom: 1px solid var(--on-air-border);
  display: grid;
  place-items: center;
  position: relative;
  text-align: center;
}

.on-air-clock-marker {
  color: var(--on-air-accent);
  font-size: clamp(1.9rem, 9cqw, 2.7rem);
  font-weight: 900;
  left: 16%;
  line-height: 1;
  position: absolute;
  top: 43%;
}

.on-air-time,
.on-air-weekday,
.on-air-date,
.on-air-live,
.on-air-track-copy p,
.on-air-track-copy small,
.on-air-dj-room p,
.on-air-message-meta,
.on-air-now-playing {
  margin: 0;
}

.on-air-time {
  color: #f5f4f1;
  font-size: clamp(3.1rem, 18cqw, 4.5rem);
  font-weight: 950;
  letter-spacing: 0.05em;
  line-height: 0.95;
  text-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
}

.on-air-weekday {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(0.8rem, 4cqw, 1rem);
  font-weight: 750;
  margin-top: 1em;
}

.on-air-date,
.on-air-live {
  color: var(--on-air-muted);
  font-size: clamp(0.58rem, 2.8cqw, 0.78rem);
  font-weight: 900;
  margin-top: 0.75em;
}

.on-air-live {
  color: var(--on-air-accent);
}

.on-air-play-strip {
  background: var(--on-air-panel);
  border-bottom: 1px solid var(--on-air-border);
  display: grid;
  gap: 0.45rem;
  grid-template-columns: 14% minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  padding: 2.2% 5% 1.6%;
}

.on-air-track-meter {
  align-items: end;
  display: flex;
  gap: 2px;
  height: 22px;
  place-self: center start;
}

.on-air-track-meter span {
  background: var(--on-air-accent);
  display: block;
  width: 3px;
}

.on-air-track-meter span:nth-child(1) { height: 9px; }
.on-air-track-meter span:nth-child(2) { height: 15px; }
.on-air-track-meter span:nth-child(3) { height: 6px; }
.on-air-track-meter span:nth-child(4) { height: 11px; }

.on-air-track-copy {
  min-width: 0;
}

.on-air-track-copy p {
  font-size: clamp(0.7rem, 3.4cqw, 0.92rem);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.on-air-track-copy small {
  color: var(--on-air-muted);
  display: block;
  font-size: clamp(0.55rem, 2.7cqw, 0.72rem);
  font-weight: 900;
  margin-top: 0.25em;
}

.on-air-controls {
  gap: 0.35rem;
  justify-content: end;
}

.on-air-controls button {
  aspect-ratio: 1;
  background: transparent;
  border: 1px solid var(--on-air-border);
  border-radius: 999px;
  color: #b9b8bd;
  display: grid;
  font-size: clamp(0.58rem, 2.8cqw, 0.75rem);
  min-height: 0;
  padding: 0;
  place-items: center;
  width: clamp(24px, 7.2cqw, 34px);
}

.on-air-progress {
  color: var(--on-air-muted);
  font-size: clamp(0.54rem, 2.6cqw, 0.7rem);
  gap: 0.55rem;
  grid-column: 1 / -1;
}

.on-air-progress div {
  background: rgba(255, 255, 255, 0.22);
  flex: 1;
  height: 3px;
}

.on-air-progress div span {
  background: #f5f4f1;
  display: block;
  height: 100%;
  width: 17%;
}

.on-air-queue-strip {
  align-items: center;
  background: var(--on-air-panel-strong);
  border-bottom: 1px solid var(--on-air-border);
  color: var(--on-air-muted);
  display: flex;
  font-size: clamp(0.62rem, 3cqw, 0.82rem);
  font-weight: 900;
  justify-content: space-between;
  padding: 0 5%;
}

.on-air-dj-room {
  background:
    linear-gradient(rgba(12, 13, 18, 0.80), rgba(12, 13, 18, 0.80)),
    radial-gradient(circle, rgba(70, 76, 126, 0.72) 1px, transparent 1px);
  background-size: auto, 11px 11px;
  display: grid;
  grid-template-rows: 15% auto minmax(0, 1fr);
  min-height: 0;
}

.on-air-dj-room header {
  align-items: center;
  background: rgba(18, 19, 24, 0.84);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  justify-content: space-between;
  padding: 0 5%;
}

.on-air-dj-room header p {
  font-size: clamp(0.9rem, 4.6cqw, 1.25rem);
  font-weight: 900;
}

.on-air-dj-room header span,
.on-air-dj-room header p span {
  color: var(--on-air-accent);
}

.on-air-server-line {
  color: var(--on-air-muted);
  font-size: clamp(0.55rem, 2.7cqw, 0.72rem);
  padding: 1.4em 0 0.8em;
  text-align: center;
}

.on-air-message {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: 36px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  padding: 0 5% 3%;
}

.on-air-message-avatar {
  height: 36px;
  width: 36px;
}

.on-air-message-author {
  color: var(--on-air-muted);
  font-size: clamp(0.55rem, 2.6cqw, 0.72rem);
  font-weight: 900;
  margin-bottom: 0.65em;
}

.on-air-message-bubble {
  background: #020307;
  border: 1px solid var(--on-air-border);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(0.78rem, 3.7cqw, 1rem);
  font-weight: 800;
  line-height: 1.58;
  max-height: 14em;
  overflow: auto;
  padding: 0.95em;
}

.on-air-message-meta {
  align-items: center;
  color: var(--on-air-muted);
  display: flex;
  font-size: clamp(0.55rem, 2.6cqw, 0.72rem);
  gap: 0.55rem;
  margin-top: 0.85em;
}

.on-air-message-meta button {
  background: transparent;
  border: 1px solid var(--on-air-border);
  border-radius: 999px;
  color: #aaaab3;
  font-size: inherit;
  min-height: 0;
  padding: 0.35em 0.75em;
}

.on-air-now-playing {
  color: #696a76;
  font-size: clamp(0.58rem, 2.8cqw, 0.74rem);
  margin-top: 2em;
  text-align: center;
}

.on-air-input-bar {
  background: rgba(19, 20, 27, 0.90);
  border-top: 1px solid var(--on-air-border);
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 1fr clamp(30px, 8cqw, 36px) clamp(36px, 9cqw, 42px);
  padding: 3.2% 5%;
}

.on-air-input-bar textarea {
  background: #03040a;
  border: 1px solid var(--on-air-border);
  border-radius: 7px;
  color: var(--on-air-text);
  min-height: 0;
  overflow: hidden;
  padding: 0.75em 0.85em;
  resize: none;
}

.on-air-input-bar textarea::placeholder {
  color: var(--on-air-muted);
}

.on-air-input-bar button {
  aspect-ratio: 1;
  border-radius: 999px;
  display: grid;
  min-height: 0;
  padding: 0;
  place-items: center;
}

.on-air-input-bar button[type="button"] {
  background: transparent;
  border-color: transparent;
  color: #b9b8bd;
}

.on-air-input-bar button[type="submit"] {
  background: #d8d7df;
  border-color: #d8d7df;
  color: #1b1b22;
  font-weight: 900;
}

.on-air-footer {
  background: rgba(46, 47, 73, 0.72);
  color: var(--on-air-muted);
  font-size: clamp(0.55rem, 2.7cqw, 0.72rem);
  font-weight: 900;
  justify-content: space-between;
  padding: 0 5%;
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): style terminal fm on air panel"
```

## Task 5: Add Morning Console Theme

**Files:**
- Modify: `apps/web/src/features/player/player-shell.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Choose Morning Console during morning hours**

In `player-shell.tsx`, add this derived value after `onAirModeLabel`:

```ts
  const onAirTheme = onAirModeLabel === "Morning" ? "morning-console" : "terminal-fm";
```

Change the `OnAirTerminal` prop:

```tsx
        theme={onAirTheme}
```

- [ ] **Step 2: Add Morning Console theme variables and overrides**

Append this CSS:

```css
.theme-morning-console {
  --on-air-accent: #5e9f8a;
  --on-air-bg: #f1dcc0;
  --on-air-border: rgba(57, 48, 36, 0.16);
  --on-air-muted: #786d5e;
  --on-air-panel: rgba(255, 246, 226, 0.62);
  --on-air-panel-strong: #2a2a24;
  --on-air-text: #241f18;
  --on-air-top: rgba(235, 213, 181, 0.88);
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 229, 182, 0.60), transparent 36%),
    #e7d0ad;
}

.theme-morning-console .on-air-panel {
  background:
    linear-gradient(rgba(241, 220, 192, 0.92), rgba(40, 58, 58, 0.72)),
    radial-gradient(circle, rgba(95, 122, 108, 0.42) 1px, transparent 1px);
  background-size: auto, 12px 12px;
}

.theme-morning-console .on-air-clock {
  background:
    linear-gradient(rgba(255, 245, 223, 0.76), rgba(255, 239, 206, 0.66)),
    radial-gradient(circle, rgba(95, 122, 108, 0.38) 1px, transparent 1px);
  background-size: auto, 12px 12px;
}

.theme-morning-console .on-air-time {
  color: #2a241c;
  text-shadow: 0 0 10px rgba(255, 250, 235, 0.62);
}

.theme-morning-console .on-air-weekday {
  color: #332c22;
}

.theme-morning-console .on-air-play-strip,
.theme-morning-console .on-air-input-bar {
  background: rgba(249, 231, 199, 0.68);
}

.theme-morning-console .on-air-dj-room {
  background:
    linear-gradient(rgba(242, 221, 189, 0.70), rgba(47, 62, 57, 0.52)),
    radial-gradient(circle, rgba(95, 122, 108, 0.34) 1px, transparent 1px);
  background-size: auto, 12px 12px;
}

.theme-morning-console .on-air-message-bubble,
.theme-morning-console .on-air-input-bar textarea {
  background: rgba(255, 248, 232, 0.82);
  color: #241f18;
}

.theme-morning-console .on-air-input-bar button[type="submit"] {
  background: #28423a;
  border-color: #28423a;
  color: #fff8e8;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/player/player-shell.tsx apps/web/src/app/globals.css
git commit -m "feat(web): add morning console on air theme"
```

## Task 6: Add Final Verification Script Notes and Run Checks

**Files:**
- Modify: `docs/superpowers/plans/2026-05-09-fakeradio-on-air-terminal-player.md`

- [ ] **Step 1: Run unit tests**

Run:

```bash
pnpm --filter @fakeradio/web test -- player-view-model.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @fakeradio/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Start the local app**

Run:

```bash
pnpm dev
```

Expected: server starts at `http://localhost:3301` and web starts at `http://localhost:3302`.

- [ ] **Step 4: Verify desktop 9:16 ratio in Browser**

Open `http://localhost:3302` in the in-app browser with a desktop viewport. Confirm:

- The visible `On Air` panel is centered.
- The panel keeps `9:16`; it is not full-width.
- Top brand bar, clock, play strip, queue strip, DJ room, input bar and footer are all visible.
- The bottom input bar is visible without scrolling.
- No text overlaps in the playback strip or DJ message bubble.

- [ ] **Step 5: Verify mobile 9:16 ratio in Browser**

Use a mobile-sized viewport such as `390x844`. Confirm:

- The panel uses nearly the full width but keeps `9:16`.
- The page background can exist outside the panel, but the core layout remains a panel.
- The bottom input bar and footer remain visible.
- The DJ message bubble scrolls internally if the text is long.

- [ ] **Step 6: Verify floating-window ratio**

Use a narrow desktop-like viewport such as `360x640`. Confirm:

- The panel does not stretch into a normal webpage layout.
- The panel width is constrained by height when needed.
- All seven structural regions remain visible.

- [ ] **Step 7: Verify theme behavior**

Temporarily force `onAirTheme` in `player-shell.tsx` to each value:

```ts
  const onAirTheme = "terminal-fm";
```

Then:

```ts
  const onAirTheme = "morning-console";
```

For each theme, reload `http://localhost:3302` and confirm:

- `Terminal FM` uses dark terminal background, point grid, cyan `ON AIR`/`LIVE`, high contrast DJ bubble.
- `Morning Console` uses warm low-stimulation background, softer dot grid, gentler status color and quieter controls.
- Both themes preserve identical `9:16` structure.

Restore the automatic theme line before committing:

```ts
  const onAirTheme = onAirModeLabel === "Morning" ? "morning-console" : "terminal-fm";
```

- [ ] **Step 8: Commit verification-only plan update after checklist changes**

When implementation discoveries require changing this plan, commit only the plan edit:

```bash
git add docs/superpowers/plans/2026-05-09-fakeradio-on-air-terminal-player.md
git commit -m "docs: update on air terminal verification plan"
```

## Final Validation Goals

Before calling the implementation complete, all of these must be true:

- `pnpm --filter @fakeradio/web test -- player-view-model.test.ts` passes.
- `pnpm --filter @fakeradio/web typecheck` passes.
- Browser verification passes at desktop, mobile, and narrow floating-window viewport sizes.
- The default route `/` shows a `9:16` `On Air` terminal, not the old full-width grid dashboard.
- `Terminal FM` is the default non-morning theme and visually follows the reference image structure.
- `Morning Console` exists as a required second theme and preserves the same structure with warmer low-stimulation styling.
- The bottom DJ input bar remains visible at all tested viewport sizes.
- Existing playback behavior still has reachable controls for starting an episode, generating the next track, and favoriting the current track.
- Server/provider diagnostics and setup controls are not displayed as flat panels on the default page.
- No backend, adapter, or shared contract changes are required for this implementation.
