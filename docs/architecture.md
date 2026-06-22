# FakeRadio 架构

FakeRadio 由四层组成：

1. 外部上下文：用户语料、LLM、音乐 provider、TTS、天气、日历、UPnP。
2. 本地大脑：context builder、DJ brain、scheduler、TTS cache、state。
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
- 初始队列、daypart 切换队列、实时 `/api/next` 都通过 Recommendation Engine (`server/src/recommendation/recommendation-engine.ts`) 生成候选；它会综合当前 block、天气、日程、用户品味、mood rules、playlist seeds、网易喜欢歌曲 seed、最近播放和当前队列。query 优先级：**艺术家 → 品味关键词 → 场景词**（不是按场景词倒推的简单路径）。网易云 adapter 走 `/simi/song` 时使用这些 `seeds`
- 每次成功生成下一首后，server 追加 `playedTrack` 记忆
- 后续 DJ 口播可引用上一首歌，形成连续过渡

### 用户偏好文件（`user/`）

| 文件 | 用途 | 缺失行为 |
|---|---|---|
| `user/taste.md` | 用户品味，注入 DJ brain 的 `userTaste` 上下文 | 回退到默认品味描述 |
| `user/routines.md` | 日常节奏，注入 DJ brain 的 `routines` 上下文 | 回退到默认日程描述 |
| `user/mood-rules.md` | Mood 规则，注入 DJ brain 的 `moodRules` 上下文 | 回退到默认 mood 规则 |
| `user/profile.md` | 个人画像（2026-06-22 新增，**已被 `.gitignore` 屏蔽不入仓**），注入 DJ brain 的 `profile` 上下文 | 不注入，不影响流程 |
| `user/playlists.json` | 歌单定义，用于生成 `buildTodayPlan` 的时段 block 和选歌 seeds | 回退到仅包含 `morning-soft-start` 的默认歌单 |
| `user/netease-liked-songs.raw.json` | 网易云收藏歌曲原始数据，作为推荐 seed | 诊断 API 返回 `loaded: false`，不影响播放 |

> **`user/profile.md` 是私人内容**：写你的"你是谁"，不写音乐品味（已有 `taste.md`）。比如：身份、生活节奏、对话风格偏好、当前在意的事。LLM 会在口播文案里参考这个画像来调整语气，但不会硬塞。

### 启动预热第一首

服务端启动后，`create-server.prewarmFirstEpisode()` 会对 `initialQueue[0]` 异步生成完整 episode（resolve → compose → TTS → 存到 `prepared_episodes`）。目的是让首次 `/api/episode/next` 命中 `source: "prepared"` 而不是走 5-15s 的 live 生成。

**关键步骤**：

1. `music.resolve(track)` 必须先调——`/api/episode/next` 的 live 路径内部 resolve，但 `claimPreparedEpisode` 不会 resolve
2. 然后 `composeEpisodeFromTrack` 生成口播文案 + TTS
3. 存到 `prepared_episodes`，`status: "ready"`

进度通过 `agent-message` WebSocket 事件广播到前端对话框，让用户看到"正在准备第一首歌的口播…"。失败时 fallback live（`/api/episode/next` 仍能正常返回）。

> **不再做"明天夜间预热"**：`create-server` 不调用 `runPrewarmForDate`。`daily-episode-prewarmer.ts` 模块保留（日终品味推断 + tonight brief 仍用），但不再生成 episode 预存。详见 `local-runbook.md` 预热章节。

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

播放器的音频管线当前遵循四条稳定性规则：

- DJ 口播播放时可以 duck 当前音乐音量，但播放失败后必须恢复音乐音量。
- story audio（`speechAudio`）播放失败时不自动回退到纯音乐，进入 `error` 状态并提示用户「口播加载失败」。
- 写入 `HTMLMediaElement.volume` 前，计算结果必须限制在 `[0, 1]`，避免浏览器抛出越界错误。
- `dj-speech` WebSocket 事件到达时，若 episode story 正在播放（`speechAudio` 未暂停），仅更新 DJ 文字但不播放音频，避免覆盖正在进行的 story 口播。

## Story Episode 链路

FakeRadio 已经实现 story-first 电台播放闭环：

1. 前端请求 `GET /api/episode/next`
2. server 选择下一首曲目（复用现有 music adapter 搜索/队列/回退逻辑）
3. `composeEpisodeFromTrack()`（`server/src/http/episode-runner.ts`）统一完成：收集资料（`StorySourceAdapter` 聚合歌词/元数据/网页研究）→ 口播生成（含 `narrationMentionsTrack` 安全守卫，未提及曲目时回退确定性文案）→ TTS 合成（真实失败回退静音 WAV）
4. server 更新播放状态、广播 `dj-speech` / `agent-message` WebSocket 事件
5. 前端先播放 story
6. story 剩余约 3 秒时音乐从安全音量（0.2）渐入
7. 音乐播放时后台预取下一集 episode（`/api/episode/prefetch`）
8. 当前音乐结束后自动进入下一集 story，形成连续电台循环

播放器支持 `idle → preparing → story → crossfade → music` 六状态机（含 `error`），状态转移定义在 `episode-state-machine.ts`，crossfade 触发条件、音量 clamp 和并发控制均通过测试覆盖。

`/api/health` 暴露 `storySource` 和 `webResearch` provider 状态。前端展示故事类型标签、资料来源说明和非创作背景免责提示。

这条链路遵循现有边界：前端不直接访问资料 provider，所有外部资料源通过 server adapter 接入。

## 播放器 UI 系统

FakeRadio 前端主界面为 **Editorial Radio**（`editorial-radio.tsx`），采用三栏桌面布局（260px / 1fr / 320px），支持 bone（浅色 `#f4f1ea`）和 graphite（深色 `#0e0e10`）两套主题，通过 `data-theme` 属性切换。

### Editorial Radio 布局

- **TopBar**（`position: fixed`，固定视口顶部）：左侧 `FakeRadio.` + 网易云登录状态，中间六导航标签（正在播放/节目单/制作/节目库/导出/设置），右侧 ON AIR 指示器 + 主题切换按钮
- **LeftColumn**（260px）：封面、曲目信息（标题/艺术家/专辑）、进度条、播放控制（V/M 音量）、UP NEXT 队列
- **CenterColumn**（1fr）：主内容区，支持六个视图 —— `main`（可视化 + DJ 引语）、`schedule`（节目单）、`production`（ProductionBoard）、`library`（ShowLibrary）、`export`（导出）、`settings`（SettingsPanel）
- **RightColumn**（320px）：TRANSCRIPT 面板（DJ/YOU 消息、Agent 活动、TASTE 折叠区、快捷指令、输入框）

所有子页面（ProductionBoard、SettingsPanel、ShowLibrary）已统一为 editorial 风格：标题用 Instrument Serif 衬线体，标签和元数据用 JetBrains Mono 等宽体 9-10px + `letterSpacing: 0.15em`，无圆角，无 emoji 图标，颜色使用 CSS 变量（`--accent`、`--ink-soft`、`--line`、`--faint`、`--mute`）。

### 排版系统

| 用途 | 字体 |
|------|------|
| Display | Instrument Serif |
| Serif EN | Cormorant Garamond |
| Body | Manrope |
| Mono | JetBrains Mono |

### 旧版皮肤系统（已清理）

此前支持 7 套主题（`terminal-fm`、`morning-console` 为旧版；`amber`、`pixel`、`terminal`、`bento`、`y2k` 为新版皮肤），通过 `skin-stage.tsx` 渲染。2026-05-29 前端清理（T2）删除了 `skin-pixel.tsx`、`skin-terminal.tsx`、`skin-bento.tsx`、`skin-y2k.tsx` 和 `on-air-terminal.tsx`，仅保留 `skin-amber.tsx` 作为可选皮肤。2026-06-21 架构简化进一步删除了前端 `ON_AIR_THEMES`、`OnAirThemeId` 类型和 `getThemeLabel` 函数（单值孤儿系统）。`useRadioBridge` hook 和 `skin-stage.tsx` 仍保留。

## Show Production 链路

FakeRadio 支持从「构思」到「成品」的完整节目制作流水线：

### 数据流

```
用户对话 / 手动创建 → ProgramBrief → ShowPlan → GenerationJob → ShowProject → Export ZIP
```

1. **ProgramBrief**：节目构思描述（主题、风格、时长等），存储在 `program_briefs` 表。可通过聊天自然语言创建（如"帮我做一期后摇主题节目"）或手动创建。
2. **ShowPlan**：由 LLM 基于 ProgramBrief 生成的结构化节目计划（`ShowPlanGenerator` 使用 `LlmAdapter.computeJson()` 生成个性化 block），支持版本化（追加约束或对话修改生成新版本）。存储在 `show_plans` 表。
3. **GenerationJob**：后台生成任务，状态机为 `pending → running → completed`（含 `paused`、`needs-replan`、`cancelled`、`failed` 中间态）。每个 job 绑定一个 ShowPlan。存储在 `generation_jobs` 表。
4. **ShowProject**：已完成的节目成品，包含音频、文案和元数据。存储在 `show_projects` 表。

### Generation Console

前端 Generation Console（`/` 主页的可折叠面板）提供对 active job 的实时控制：

- 启动/暂停/恢复/取消任务
- 追加约束（如 `preferEra=1990s`、`moodHint=focused`）触发 `needs-replan`，生成新版 ShowPlan
- 320px / 375px / 1440px 多视口适配

### 一键生成

`POST /api/shows/generate-now` 提供同步端到端生成：从 brief 创建 → plan 生成 → job 执行 → show 成品，单次请求完成全流程。

### 对话式节目编排

FakeRadio 支持通过自然对话完成节目编排，用户可以像和 DJ 聊天一样创建、修改和确认节目计划。

**意图检测**采用两层策略：
1. **regex 快速路径**（零延迟）：匹配"帮我做一期xxx主题节目"等明确指令
2. **LLM 兜底检测**（1-3s）：regex 未命中时，用 `computeJson()` 判断自然语言意图（如"最近在听很多后摇"→ 识别为节目创建意图）

**多轮对话流程**：
- **create**：用户表达节目意图 → 创建 ProgramBrief → LLM 生成个性化 ShowPlan → 返回节目编排摘要
- **refine**：用户修改计划（如"改成 30 分钟"、"多放 Mogwai"）→ LLM 更新 ShowPlan blocks → 返回 diff
- **confirm**：用户确认计划 → 更新 brief status 为 confirmed → 引导到生成面板
- **cancel**：用户取消 → 更新 brief status 为 cancelled

对话上下文通过 `SessionRepository`（当日会话记录）推断，不引入独立的 conversation state 存储，保持无状态架构。

## 天气与日历 Adapter

### Weather Adapter

`WeatherAdapter`（`server/src/adapters/io/weather-adapter.ts`）：

- `mock`：返回固定天气数据
- `auto`（默认）：有 `FAKERADIO_OPENWEATHER_API_KEY` 时使用 OpenWeatherMap，否则回退 mock

环境变量：`FAKERADIO_OPENWEATHER_API_KEY`、`FAKERADIO_WEATHER_CITY`（默认 `Beijing`）。

### Calendar Adapter

`CalendarAdapter`（`server/src/adapters/io/lark-calendar-adapter.ts`）：

- `mock`：返回固定日程数据
- `auto`（默认）：有 `FAKERADIO_LARK_APP_ID` 时使用 Lark Calendar，否则回退 mock

环境变量：`FAKERADIO_LARK_APP_ID`、`FAKERADIO_LARK_APP_SECRET`。

两种 adapter 遵循与 LLM/TTS 相同的 auto-detect 模式：环境变量存在时自动启用真实 provider，缺失时静默回退 mock。`/api/health` 暴露 `adapters.weather` 和 `adapters.calendar` 状态。

## 预热与调度

FakeRadio 支持预热，提前生成 episode：

- `FAKERADIO_PREWARM_ENABLED=true` 启用
- `FAKERADIO_PREWARM_TIME` 控制定时触发时间（默认 `23:30`）
- 服务启动时若当天未预热过，自动补跑一次（`skipStartupPrewarm` 选项可禁用）
- 预热和定时触发共用 `prewarmForDate()` 函数，统一 shouldRun → run → mark 流程
- 每个 daypart block 生成 `FAKERADIO_PREWARM_EPISODES_PER_BLOCK` 个 episode
- 预热结果存入 `prepared_episodes` 表
- `/api/episode/next` 选歌优先级：**优先槽（用户"插到下一首"）→ prepared episode（`source: "prepared"`）→ live 推荐（`source: "live"`）**。无可用 prepared episode 时走实时生成
- 预热后自动尝试下载歌曲音频到 `user/audio/` 目录

### 优先槽（priority next track）

`PlaybackState` 持有一个与推荐缓冲池 `queue` **分离**的优先槽 `priorityNextTrack`，用于承载用户在 DJ 聊天里点确认"插到下一首"的曲目。它拥有最高播放优先级：

- `POST /api/queue/insert-next` 写入优先槽（不再 unshift 进 `queue`），并从 `queue` 去重移除同一首
- `/api/episode/next` 和 `/api/episode/prefetch` 顶部先消费优先槽：next 路由 `music.resolve` 后清槽并组装 episode；prefetch 路由返回但不清槽（等前端接续播放时 `/api/episode/playing` 按 id 匹配清槽，避免预取结果被丢弃时丢歌）
- `resolveNextTrackAndDecision` 把优先槽曲目 id 加入推荐排除集，防止推荐引擎把它当候选再选一次导致连播两遍
- 前端 `editorial-radio.handleConfirmSuggestion` 在 `insertNextTrack` 成功后调 `playback.refreshPrefetch()`：等在途预取结束 → 清掉旧 `nextEpisodeRef` → 重新预取，让 UP NEXT 立即显示选中曲目

> 这个槽位是为修复「DJ 说插到下一首了但实际没插入」而引入的。根因：旧实现把歌 unshift 进 `queue`，但 player 切下一首走 prewarm/推荐，`queue` 仅作最后兜底几乎永远轮不到；推荐引擎还把 `queue` 里的歌排除掉。独立优先槽 + 端点优先消费 + 前端刷新预取三层一起才真正打通。

## 导出管道

导出采用异步任务模式：

1. `POST /api/export/today` 或 `POST /api/projects/:id/export` 创建任务，立即返回 `202 { taskId }`
2. 后台执行：音频混音 → 生成 show notes → 打包 ZIP
3. `GET /api/export/status/:taskId` 轮询状态（`pending/running/completed/failed`）
4. `GET /api/export/download/:date` 或 `GET /api/export/project/:id/download` 下载 ZIP

任务状态通过 module-level Map 管理，不持久化（server 重启后任务丢失）。

## 收藏与推荐

收藏歌曲参与推荐，但不再作为默认播放池：

- `user/netease-liked-songs.raw.json` 存储网易云「我喜欢的音乐」导出数据
- `liked-songs-repository.ts` 提供加载、诊断和随机采样
- Recommendation Engine 把收藏歌曲作为 taste seed，优先扩展相似歌曲和符合当前时段/天气/日程的策划候选
- 收藏原曲会被排除在常规候选之外，只有策划推荐、search 和队列都不可用时才作为最终兜底
- LLM 可从候选列表中指定曲目（`rerankSource: "llm-pick"`），否则走确定性兜底
- `/api/next` 的 `diagnostics` 字段暴露 `candidateSource`、`rerankSource`、`favoritesAvailable`、`signals`、`queries`、`seedCount` 等诊断信息
