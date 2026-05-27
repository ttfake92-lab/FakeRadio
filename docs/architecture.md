# FakeRadio 架构

FakeRadio 由四层组成：

1. 外部上下文：用户语料、LLM、音乐 provider、TTS、天气、日历、UPnP。
2. 本地大脑：intent router、context builder、DJ brain、scheduler、TTS cache、state。
3. 运行时 context window：system prompt、用户语料、环境注入、记忆、输入和工具结果、执行轨迹。
4. 交互层：Next.js PWA、HTTP contract、WebSocket stream、单一 audio 元素。

前端永远不直接调用外部服务，只连接本地 server。server 通过 adapter 管理外部能力。

## 当前主链路

当前最完整的一条运行链路是：

1. 前端调用 `GET /api/next`
2. server 收集天气、日历、设备和近期播放记忆
3. DJ brain 先生成一个 draft 选歌 query
4. music adapter 用该 query 搜索候选曲目，并解析出最终可播放 `audioUrl`
5. server 优先选择不同于当前播放的候选曲目；候选和队列都为空时，单次回退到 mock music adapter
6. server 把真实曲目、provider 状态和当前队列再次注入 DJ brain，生成 grounded 文案
7. TTS adapter 生成口播音频路径；真实 TTS 失败时回退到 mock TTS
8. server 更新当前播放状态、追加播放记忆，并通过 `/stream` 广播
9. 前端刷新当前曲目、队列、DJ 口播和诊断状态

## 真实音乐来源与回退

当前 music provider 有两层：

- `mock music adapter`
- 本地 `NeteaseCloudMusicApi` HTTP adapter

provider 选择由 `server/src/adapters/music/create-music-adapter.ts` 统一处理：

- `mock`：直接走 mock
- `auto`：优先探测本地网易云，失败回退 mock
- `netease`：显式尝试网易云；当前版本不可用时仍回退 mock

这个选择结果会同时影响：

- `/api/health` 的 `adapters.music`
- `/api/next` 的真实歌曲来源
- 前端播放器的 provider 提示和回退警告

`/api/next` 的曲目选择规则保持 provider 无关：

- 如果搜索结果中存在非当前曲目，优先选择第一首非当前曲目。
- 如果搜索结果只有当前曲目，才允许重复。
- 如果搜索结果为空，尝试使用启动队列中的非当前曲目。
- 如果搜索和队列都为空，使用 mock music adapter 作为单次兜底，保证本地电台主流程不断流。

## 连续性与 daypart

FakeRadio 当前已经有最小连续性闭环：

- `buildTodayPlan(playlists?)` 生成当天的时段计划；当传入 `user/playlists.json` 内容时，block 的 `label` 和 `moodHint` 取自对应 playlist 的 `name` 与首个 `seed`，未传入时回退到硬编码默认值
- `getCurrentPlanBlock()` 选出当前时段 block
- 初始队列按当前 block 的 `moodHint`（即对应 playlist 的首个 seed）生成
- 每次成功生成下一首后，server 追加 `playedTrack` 记忆
- 后续 DJ 文案可引用上一首歌，形成连续过渡

当前 daypart block 与默认 playlist 对应关系：

- `07:00` 早晨轻启动 → `morning-soft-start`
- `09:00` 写代码专注 → `focus-coding`
- `21:00` 晚间降速 → `night-downshift`

## 播放器观测面

PWA 目前不是纯展示壳，而是本地运行态面板。它直接展示：

- 当前播放状态
- stream 连接状态
- 当前 music provider 状态
- 当前曲目与队列来源
- mock 回退提示
- 今日计划与最新 `/api/next` 决策结果

播放器的音频管线当前遵循三条稳定性规则：

- DJ 口播播放时可以 duck 当前音乐音量，但播放失败后必须恢复音乐音量。
- story audio（`speechAudio`）播放失败时不自动回退到纯音乐，进入 `error` 状态并提示用户「口播加载失败」。
- 写入 `HTMLMediaElement.volume` 前，计算结果必须限制在 `[0, 1]`，避免浏览器抛出越界错误。

## Story Episode 链路

FakeRadio 已经实现 story-first 电台播放闭环：

1. 前端请求 `GET /api/episode/next`
2. server 选择下一首曲目（复用现有 music adapter 搜索/队列/回退逻辑）
3. `StorySourceAdapter` 收集歌词（网易云）、公开元数据（MusicBrainz）和网页研究（Brave Search）资料
4. story composer 按证据门槛生成中文短故事（`background` / `lyric-theme` / `mood-reading`）
5. TTS adapter 合成故事音频；真实 TTS 失败时，mock TTS 生成真实静音 WAV 文件回退
6. 前端先播放 story
7. story 剩余约 3 秒时音乐从安全音量（0.2）渐入
8. 音乐播放时后台预取下一集 episode
9. 当前音乐结束后自动进入下一集 story，形成连续电台循环

播放器支持 `idle → preparing → story → crossfade → music` 六状态机（含 `error`），crossfade 触发条件、音量 clamp 和并发控制均通过测试覆盖。

`/api/health` 暴露 `storySource` 和 `webResearch` provider 状态。前端展示故事类型标签、资料来源说明和非创作背景免责提示。

这条链路遵循现有边界：前端不直接访问资料 provider，所有外部资料源通过 server adapter 接入。

## 播放器皮肤系统

FakeRadio 前端播放器支持 7 套主题（`terminal-fm`、`morning-console` 为旧版；`amber`、`pixel`、`terminal`、`bento`、`y2k` 为新版皮肤），通过 `skin-stage.tsx` 根据当前主题选择渲染。

### 皮肤组件架构

5 套新版皮肤各自独立（`.tsx` 文件），通过 `.fr-*` CSS 前缀实现样式隔离：

| 皮肤 | 文件 | 风格 |
|------|------|------|
| 暖橙胶片 (amber) | `skin-amber.tsx` | 胶片质感、渐变封面、wave avatar |
| 像素 Game Boy (pixel) | `skin-pixel.tsx` | 4 色调色板、ASCII 条、Canvas 封面 |
| 终端 TUI (terminal) | `skin-terminal.tsx` | 终端风格、ASCII 封面、Spectrum 频谱 |
| Bento 玻璃 (bento) | `skin-bento.tsx` | 毛玻璃卡片、Bento 网格布局 |
| Y2K / Win98 (y2k) | `skin-y2k.tsx` | Windows 98 风格、可拖拽窗口、VU 表 |

### useRadioBridge 桥接层

`useRadioBridge` hook 位于 `player-shell.tsx` 与皮肤组件之间，将外部状态（播放状态、曲目、音频控制）转换为皮肤组件所需的 `RadioState` 对象，并管理聊天消息状态（greeting seed、流式 SSE 响应、bubble action）。

关键接口：`ask(userText, opts?)`（聊天）、`send(override?)`（发送）、`onBubbleAction(kind, msg)`（气泡操作：fav/more/less/copy）。

### DJ Persona

4 套人格通过 `skin-config.ts` 的 `PERSONAS` 配置：

| ID | 名称 | 短名 | 风格 |
|----|------|------|------|
| `midnight` | 深夜电台 | 阿夜 | 低声、慢、留白多 |
| `morning` | 清晨陪伴 | 晓 | 温柔、明亮、轻快 |
| `buddy` | 话痨好友 | 搭子 | 松、口语、可自嘲 |
| `cool` | 极简冷淡 | STATIC | 冷淡、克制、一两句 |

人格选择通过 Settings 面板（皮肤组件内）持久化到 `localStorage("fakeradio-persona")`。

## Show Production 链路

FakeRadio 支持从「构思」到「成品」的完整节目制作流水线：

### 数据流

```
ProgramBrief → ShowPlan → GenerationJob → ShowProject → Export ZIP
```

1. **ProgramBrief**：节目构思描述（主题、风格、时长等），存储在 `program_briefs` 表。
2. **ShowPlan**：由 LLM 基于 ProgramBrief 生成的结构化节目计划，支持版本化（追加约束生成新版本）。存储在 `show_plans` 表。
3. **GenerationJob**：后台生成任务，状态机为 `pending → running → completed`（含 `paused`、`needs-replan`、`cancelled`、`failed` 中间态）。每个 job 绑定一个 ShowPlan。存储在 `generation_jobs` 表。
4. **ShowProject**：已完成的节目成品，包含音频、文案和元数据。存储在 `show_projects` 表。

### Generation Console

前端 Generation Console（`/` 主页的可折叠面板）提供对 active job 的实时控制：

- 启动/暂停/恢复/取消任务
- 追加约束（如 `preferEra=1990s`、`moodHint=focused`）触发 `needs-replan`，生成新版 ShowPlan
- 320px / 375px / 1440px 多视口适配

### 一键生成

`POST /api/shows/generate-now` 提供同步端到端生成：从 brief 创建 → plan 生成 → job 执行 → show 成品，单次请求完成全流程。

## 预热与调度

FakeRadio 支持夜间预热，提前生成次日节目：

- `FAKERADIO_PREWARM_ENABLED=true` 启用
- `FAKERADIO_PREWARM_TIME` 控制触发时间（默认 `02:00`）
- 每个 daypart block 生成 `FAKERADIO_PREWARM_EPISODES_PER_BLOCK` 个 episode
- 预热结果存入 `prepared_episodes` 表
- `/api/episode/next` 优先领取 prepared episode（`source: "prepared"`），无可用时走实时生成（`source: "live"`）
- 预热后自动尝试下载歌曲音频到 `user/audio/` 目录

## 导出管道

导出采用异步任务模式：

1. `POST /api/export/today` 或 `POST /api/projects/:id/export` 创建任务，立即返回 `202 { taskId }`
2. 后台执行：音频混音 → 生成 show notes → 打包 ZIP
3. `GET /api/export/status/:taskId` 轮询状态（`pending/running/completed/failed`）
4. `GET /api/export/download/:date` 或 `GET /api/export/project/:id/download` 下载 ZIP

任务状态通过 module-level Map 管理，不持久化（server 重启后任务丢失）。

## 收藏与推荐

收藏歌曲参与选歌候选：

- `user/netease-liked-songs.raw.json` 存储网易云「我喜欢的音乐」导出数据
- `liked-songs-repository.ts` 提供加载、诊断和随机采样
- `/api/next` 的候选选择优先从收藏列表采样，收藏为空时走 search
- LLM 可从候选列表中指定曲目（`rerankSource: "llm-pick"`），否则走确定性兜底
- `/api/next` 的 `diagnostics` 字段暴露 `candidateSource`、`rerankSource`、`favoritesAvailable` 等诊断信息
