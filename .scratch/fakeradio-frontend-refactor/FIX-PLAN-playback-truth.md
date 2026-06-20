# 修复方案：播放/显示不一致 + 对话/编排"看起来不可用"

> 状态：待评审（不动手）。基于 2026-06-07 Chrome DevTools 真实操作验收。
> 验收证据见同目录 `bug-now-vs-episode-mismatch.png`。

## 一、问题复盘（结论先行）

真实操作复现后，三个症状只有**一个根因**：违反了 CONTEXT.md:82「前端保留单一播放管线」。

- **问题 1（播放≠显示）= 真 bug，100% 复现。** 前端同时存在两套"正在播放"真相：
  - 显示卡片读 `now.track`（服务端共享 `state` 广播）
  - 实际音频播 `episodeData.track`（前端自己 `/api/episode/next` 的返回）
  - 每调一次 `/api/episode/next` 都换一首不同歌（实测连续 3 次：Midnight Rider's Prayer → Un Amico → Find a Place）并改写服务端 `state`，前端再轮询/WS 把卡片刷成那首没在放的歌。
- **问题 2（无法和 DJ 对话）= 功能通的。** `POST /api/chat/stream` 返回 200 且 DJ 正常回复，但被自动整轨旁白淹没，观感像"没理我"。
- **问题 3（无法编排节目）= 功能通的。** 一句对话即创建 brief + 6 block，点 GENERATE NOW 成功起 job。

> 修正：之前口头提到 scheduler-loop 也写 now —— 经核实 `create-server.ts:209` **未接 `onDaypartChange/onHourlyTick` 回调**，scheduler 当前不改写 now。真正的 now 写入方见下。

## 二、根因定位（带文件/行号）

### 根因 A：前端两个字段用了相反的优先级，单卡片必然混源

[apps/web/src/features/player/use-player-controls.ts:42](apps/web/src/features/player/use-player-controls.ts:42)
```ts
const track: Track | null = now?.track ?? playback.episodeData?.track ?? null;  // now 优先
```
[apps/web/src/features/player/player-shell.tsx:193](apps/web/src/features/player/player-shell.tsx:193)
```ts
const currentTrackTitle = playback.episodeData?.track.title ?? track?.title;    // episode 优先
```
[apps/web/src/features/player/skin-stage.tsx:144-152](apps/web/src/features/player/skin-stage.tsx:144) 把两者拼进同一张卡：`id/album/source/封面`走 `track`(now 优先)，`title/artist` 走 `currentTrackTitle`(episode 优先)。
→ 即使没有任何 now 抖动，卡片也能出现"A 的封面 + B 的标题"。

### 根因 B：服务端 `state.track`（即 `/api/now`）有多个写入方，各自广播 `now-playing`

| 写入点 | 文件:行 | 触发时机 |
|---|---|---|
| `/api/next` | [register-routes.ts:204,230](server/src/http/register-routes.ts:204) | 旧换歌接口 |
| `/api/episode/next`（prepared 分支） | [register-routes.ts:364,367](server/src/http/register-routes.ts:364) | 前端每次 PLAY/NEXT |
| `/api/episode/next`（live 分支） | [register-routes.ts:398,400](server/src/http/register-routes.ts:398) | 同上，且每次选歌不同 |
| chat 换歌意图 | [chat-sse-handler.ts:145,148](server/src/http/chat-sse-handler.ts:145) / [chat-intent-router.ts:375](server/src/http/chat-intent-router.ts:375) | 对话被判为"换一首" |

`/api/episode/prefetch`（[register-routes.ts:460](server/src/http/register-routes.ts:460)）已正确做到"不改 state"，可作为正面参照。

### 根因 C：前端 episode 播放器完全无视 `now-playing`

[use-playback-state.ts](apps/web/src/features/player/use-playback-state.ts) 只播自己 `playEpisode()` 的返回，从不消费 WS `now-playing`。于是"实际在放的"和"卡片显示的"是两条永不相交的线。

### 附带问题 D：WS 连上后被 diagnostic 覆盖状态，导致冗余轮询

[use-stream-connection.ts:94-96](apps/web/src/features/player/use-stream-connection.ts:94) 收到 `diagnostic` 把 `streamStatus.label` 设成 `"info"`；[player-shell.tsx:150](apps/web/src/features/player/player-shell.tsx:150) 判定 `label !== "已连接"` 即启动 10s 轮询 → WS 与轮询双写 now，加剧抖动。

## 三、设计原则（修复对齐设计文档）

**单一真相：正在播放的内容 = 当前 episode。** `/api/now` 只在 idle（还没开始播）时作"预览/上一次状态"，一旦进入 episode 播放，显示一律跟随 `episodeData`，并忽略与当前 episode 不符的 `now-playing`。

## 四、修复方案（按性价比分阶段）

### 阶段 1：前端统一播放真相（核心，必做）

**目标验证标准：** 点 PLAY 后，卡片封面/标题/艺人/专辑/来源/时长/UP NEXT，全部等于实际在放的 episode；连续 PLAY/NEXT 多次，卡片与音频始终一致；DJ 文案与当前曲目一致。

1. **`skin-stage.tsx` 的 `visualTrack` 改为单源**
   - 新增 prop `activeTrack: Track | null`（播放中=`episodeData.track`，idle=`now.track`）。
   - `visualTrack` 的 `id/album/source/dur/tone/封面` 全部取自 `activeTrack`，删除 `now.track` 与 `currentTrackTitle` 混用。

2. **`player-shell.tsx` 计算单一 `activeTrack`**
   ```ts
   const isEpisodeActive = playback.episodeState !== "idle" && playback.episodeData !== null;
   const activeTrack = isEpisodeActive ? playback.episodeData!.track : (now?.track ?? null);
   ```
   - `currentTrackTitle/Artist/durationMs/封面` 全部派生自 `activeTrack`，不再 `?? track?.xxx` 跨源兜底。
   - 传给 `SkinStage` 的 `track` 改为 `activeTrack`。

3. **UP NEXT 队列在 episode 模式下跟随 prefetch**
   - `skin-stage.tsx:155 visualNext`：episode active 时优先用 `playback.nextEpisode?.track`（已 prefetch），无则留空，而非 `now.queue[0]`（那是 mock 队列）。

4. **DJ 文案单源**
   - `realDjMessageSource` 已是 `episodeData?.story.text ?? now?.dj.say`（[player-shell.tsx:196](apps/web/src/features/player/player-shell.tsx:196)），保留；但 episode active 时**不要**再被 WS `dj-speech` 覆盖（见阶段 2）。

> 影响面：仅 3 个前端文件（`player-shell.tsx`、`skin-stage.tsx`、可能 `use-player-controls.ts:42` 的 `track` 派生）。服务端不动。这一步即可消除"播放≠显示"。

### 阶段 2：前端忽略与当前 episode 不符的实时事件（必做，配合阶段 1）

`use-stream-connection.ts` 的 `now-playing` / `dj-speech` 处理增加门控：当本地 `episodeState` 处于 `preparing/story/crossfade/music` 时，
- `now-playing`：不更新卡片主状态（可仅更新 health/queue 等非冲突字段，或整段跳过）。
- `dj-speech`：**不再**抢用 `speechRef` 播放（当前 [use-stream-connection.ts:72-87](apps/web/src/features/player/use-stream-connection.ts:72) 会和 episode story 抢同一个 audio 元素）。仅在 idle 时允许。

> 需要把 `episodeState` 传入 `useStreamConnection`（已有 `audio` 引用，加一个 `getEpisodeState()` 或 ref 即可）。

### 阶段 3：修 WS 状态覆盖 + 去冗余轮询（小修，建议做）

- `use-stream-connection.ts`：收到 `diagnostic` 时**不要**覆盖 `streamStatus.label`，改为单独的 `diagnostic` 字段，或仅在 `level === "error"` 时降级。
- 保证 WS 连上后 `label === "已连接"` 稳定，[player-shell.tsx:150](apps/web/src/features/player/player-shell.tsx:150) 的轮询不再误启。

### 阶段 4（可选，体验优化）：对话区与自动旁白分流

把"DJ 对你说的话（chat 回复）"与"整轨自动旁白（now/story）"在 UI 上分成两个通道，避免互相淹没。属于交互优化，不阻塞根因修复。

### 不在本次范围
- 服务端是否该收敛多个 now 写入方为单一编排器：阶段 1+2 后，前端已不受其影响，可后续单独评估。当前不动，降低风险。
- `/api/next`（旧接口）的去留：暂留。

## 五、验证计划

1. `pnpm test`（前端改动涉及 `player-shell-brief-filter.test.ts`、`use-playback-state.test.ts`、`use-stream-connection.test.ts`，需同步）。
2. `pnpm --filter @fakeradio/web typecheck`。
3. Chrome DevTools 真实复验（同本次脚本）：
   - 点 PLAY → 比对卡片所有字段 vs `<audio>` 实际 src/`episodeData`，必须一致。
   - 连点 NEXT 3 次 → 每次卡片与音频一致，不再出现第三首乱入。
   - 发一句对话 → 回复可见、不被旁白淹没；卡片不因对话跳歌（除非确为换歌意图）。
   - 编排：对话建 brief → GENERATE NOW → job running。
   - Network：WS `已连接` 后无 10s `/api/now` 轮询。

## 六、风险与取舍

- **取舍**：本方案优先"前端单源"而非"服务端单一编排器"。理由——改动小、风险低、直接命中用户可感知的问题；服务端多写入方在单用户本地场景下，只要前端不盲信 `now-playing` 即可隔离。符合 CLAUDE.md「正确性 > 可读性 > 性能」与"外科手术式修改"。
- **风险**：`useStreamConnection` 需要读 `episodeState`，注意闭包陈旧——用 ref 传递，避免重连 WS。
- **测试同步**：现有 3 个测试文件断言了旧的混源行为，需一并更新断言。
