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

### 启动批量预热

服务端启动后，`create-server.prewarmStartupEpisodes()` 对当前 block 调 `runPrewarmForDate`，后台异步预生成 N 首（`FAKERADIO_PREWARM_STARTUP_EPISODES`，默认 10）完整 episode（resolve → compose → TTS → 存到 `prepared_episodes`）。目的是让 `/api/episode/next` 和 `/api/episode/prefetch` 命中 `source: "prepared"` 秒切，而不是每首走 5-15s 的 live 生成。

**关键步骤**（`daily-episode-prewarmer.generatePrewarmEpisode`）：

1. `music.resolve(track)` 必须先调——`/api/episode/next` 的 live 路径内部 resolve，但 `claimPreparedEpisode` 不会 resolve
2. 然后 `composeEpisodeFromTrack` 生成口播文案 + TTS（注入 `profile` + `personalHistory`，与 live 路径对齐，否则预热口播质量退化）
3. 存到 `prepared_episodes`，`status: "ready"`

进度通过 `agent-message` WebSocket 事件广播到前端对话框，让用户看到"正在准备 N 首口播…"。后台 `void` 异步，不阻塞启动和首次播放；第一首就绪后即可播，其余陆续准备。失败时 fallback live（`/api/episode/next` 仍能正常返回）。

**低水位补生成**：`register-routes.ensurePreparedEpisodes()` 在 next/prefetch 消费一首 prepared 后触发；当前 block ready 数 < `FAKERADIO_PREWARM_LOW_WATER_MARK`（默认 2）时后台补到 N 首。防重入，不阻塞响应。这是"播到最后一首时再加载下一批"的真正落点——prepared 才是秒切关键，不是内存 queue 的 track。

> **历史**：2026-06-22 早些版本曾取消批量预热、只预热第一首（`prewarmFirstEpisode`），因当时批量预热引发"已选曲目又重播"（prefetch 漏登记）。该 bug 后由优先槽 + prefetch 不清槽修复，消费链路干净，故重新启用批量预热。详见 `local-runbook.md` 预热章节。

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
- story audio（`speechAudio`）播放失败（`onerror` 或 `play()` reject）时**自动切下一首**（偶发失败），连续 3 次失败才停在 `error` 状态提示「连续多首口播加载失败，请检查网络或 TTS 服务」。避免单次口播加载失败就把用户卡在"口播加载失败"等手动点。
- 切歌（`playEpisodeData`）时先 `pause()` 两个 audio 元素再设新 src，防止旧口播/旧音乐尾音与新口播并行（"两个音频打架"根因）。
- 写入 `HTMLMediaElement.volume` 前，计算结果必须限制在 `[0, 1]`，避免浏览器抛出越界错误。
- `dj-speech` WebSocket 事件到达时，若 episode story 正在播放（`speechAudio` 未暂停），仅更新 DJ 文字但不播放音频，避免覆盖正在进行的 story 口播。
- 可视化动效（`useAudioReactiveVisualizer`）的 `reactive`（真实频谱 vs CSS 假波形）只由 `!audio.paused && !audio.ended` 决定，不看能量阈值——前奏/弱段能量本就低，用阈值当开关会在暂停恢复后卡在假动效。

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

`POST /api/shows/generate-now` 提供同步端到端生成：从 brief 创建 → plan 生成 → job 执行 → show 成品，单次请求完成全流程。失败处理、主题分类、选歌优先级和 narration 注入见下文「主题分类与选歌」「剧本式 narration」「一键生成与失败处理」三节。

### 对话式节目编排

FakeRadio 支持通过自然对话完成节目编排，用户可以像和 DJ 聊天一样创建、修改和确认节目计划。

**意图检测**采用两层策略：
1. **regex 快速路径**（零延迟）：匹配 `做一期 X 主题节目` / `做 X 的节目` / `做一期 X` / `策划|安排|编排|制作 一期 X 节目`，前缀允许"我想/我要/想做"被吸收，命中即创建 brief。覆盖见 `server/src/show/brief-intent-parser.ts:THEME_SHOW_PATTERNS`。
2. **LLM 兜底检测**（1-3s）：regex 未命中时，用 `computeJson()` 判断自然语言意图（如"最近在听很多后摇"→ 识别为节目创建意图）

**多轮对话流程**：
- **create**：用户表达节目意图 → 创建 ProgramBrief → LLM 生成个性化 ShowPlan → 返回节目编排摘要
- **refine**：用户修改计划（如"改成 30 分钟"、"多放 Mogwai"）→ LLM 更新 ShowPlan blocks → 返回 diff
- **confirm**：用户确认计划 → 更新 brief status 为 confirmed → 引导到生成面板
- **cancel**：用户取消 → 更新 brief status 为 cancelled

对话上下文通过 `SessionRepository`（当日会话记录）推断，不引入独立的 conversation state 存储，保持无状态架构。

### 主题分类与选歌

`POST /api/shows/generate-now` 执行节目时（`scheduler-integration.ts:executeScheduledJob`），先对 `brief.topic` 做一次 LLM 主题分类（`classify-show-topic.ts`），输出 `{ kind, anchors }`：

| kind | 含义 | anchors 示例 | 选歌行为 |
|------|------|-------------|---------|
| `artist` | 具体艺术家/乐队 | `["陈奕迅", "Eason Chan"]` | 候选必须 artist 字段命中 anchors（substring 双向匹配），否则丢弃 |
| `album` | 具体专辑名 | `["OK Computer"]` | 同 artist 类型硬过滤 |
| `style` | 流派/风格 | `["Britpop", "1990s UK rock"]` | anchors 作为查询前缀辅助召回，不做硬过滤 |
| `mood` | 氛围/场景 | `["深夜伤感", "late night sad"]` | 同 style |
| `none` | 太宽泛或解析失败 | `[]` | 不做主题约束（fallback 保护） |

每条 block 的选歌按以下优先级（`scheduler-integration.ts:generateEpisodeForBlock`）：

1. **block.selectionGoal 精准 search**（最高优先级）：从 `selectionGoal`/`storyGoal` 提取《歌名》→ 拼成"主题艺术家 + 歌名"查询，命中即用。这是"节目按编排走"的核心机制。
2. **favorites + DJ brain**：search 没召回时，用 `computeDjDecision` 从主题艺术家的 favorites 子集（artist/album 时硬过滤后再走 DJ brain，没有再退到全量 favorites）挑歌；executionState 带上 block title + selectionGoal 让 LLM 知道叙事意图。
3. **music.recommend**：以艺术家名作种子词请求相似歌曲，对返回结果再做硬过滤。
4. **丢约束 search**：上面三层都没命中且 isStrictTopic，给一次完全忽略主题的兜底 search。
5. **favorites 全集**：search/recommend 全部失败（常见原因：网易云 cookie 失效导致 `/cloudsearch` 解密报错返回空），从用户 favorites 全集挑任一未排除的歌，保证节目能成型——记 warn 日志 `[show-gen] block X using favorites fallback`。

> **历史坑**：旧实现把 `computeDjDecision` 当第一层，但 LLM 只看到 `"theme-show-block-opening"` 这种 role 字符串，**根本不知道 block 要选哪首具体歌**，每条 block 都从同一池随机挑热门。selectionGoal 在第二层 search 才生效，但第一层已经把名额占了。2026-06-24 修复：把 selectionGoal search 提到第一层。

### 剧本式 narration（show plan 注入口播）

主题节目编排时，`composeEpisodeFromTrack` 接收 `ShowPlanNarrationContext`（`server/src/http/episode-runner.ts`），把整期剧本信息注入 narration prompt：

- 节目主题、当前 block 在整期里的位置（`第 N/8 段`）
- 当前 block 的 `role` / `title` / `storyGoal`（叙事意图）
- 上一段 / 下一段的 role + title（让 LLM 自然承接 + 埋伏笔）
- 整期 8 段一览（让 LLM 看到全局叙事弧）

prompt 里追加"按剧本中的这一幕来写"约束：紧扣段落情绪基调（低谷篇要写失落感、巅峰篇要写 momentum、影响篇要写传承）；opening 定基调；closing 回扣开场、留余韵；中段推进叙事。每集仍保持 2-7 句不超长，剧本是隐线、情绪是表层。

只有节目编排路径（scheduler-integration）传 `showPlanContext`，普通播放/今日节目/prefetch 路径不传，日常体验不动。

### 一键生成与失败处理

`POST /api/shows/generate-now` 提供同步端到端生成。当前实现细节：

- **slug 生成**：`${YYYY-MM-DD}-${topicSlug}-${ms.toString(36)}` 带毫秒时间戳，避免同一天同一主题重复 brief 撞 sqlite UNIQUE。
- **同一 brief 复用 project**：先 `getByBriefId(briefId)`，已存在 project 不重复 create。
- **跑路工厂式 try**：plan/job 准备阶段、execution 阶段都包在 try 里，失败返回 `500 { error: <详情>, phase: "preparation"|"execution", project?, job? }`，前端 `apps/web/src/lib/api-client.ts:generateNow` 优先取 `errorBody.error` 而非 fastify 默认 `message`，并加 `[phase]` 前缀显示。

前端 `handleGenerateNow` 是 **fire-and-forget**（`apps/web/src/features/studio/editorial-radio.tsx`）：立即 `setActiveView('library')` + `startJobTracking(briefId)` 启动轮询，不 await 整条流水线（30-120s）。后端 preparation 阶段直接挂掉时（job 还没创建，poll 不到任何东西），前端 catch 里构造 client-side failed trackedJob 让 `ProductionProgressPanel` 把错误亮出来；用 `console.warn` 而非 `console.error` 避免 Next.js dev overlay 弹"Internal Server Error"窗。

### DJ 聊天推荐歌曲

聊天里"给我来点摇滚"、"推荐 Pink Floyd"这类点歌请求走 `/api/chat/stream` 的默认路径（非节目编排、非快捷指令），由 `chat-sse-handler` 处理：

1. **LLM 决策**：`computeDjDecision` 出 `decision.say`（口播文字）+ `decision.play.query`（搜索意图）。DJ 人设 prompt 约束：用户提到具体艺术家/歌曲/专辑名时，`play.query` 必须原样保留该名字，不翻译成风格词；没有要听新歌的意思时留空。
2. **实体提取**：`extractMentionedEntities(msg)` 从用户原话提取明确实体名（引号/书名号内容、多词英文专有名词如 "Pink Floyd"、带变音符的非 ASCII 名如 "Sigur Rós"），与 LLM 的 `playQuery` 并列进推荐 queries 最前。**用户原话 + LLM 翻译双保险**——网易云搜索靠原名命中，LLM 翻译成 "classic rock" 会搜不到 Pink Floyd。
3. **候选生成**：`selectRecommendedCandidates` 走推荐引擎，queries 顺序为 `[用户实体, playQuery, taste, 场景]`，limit 5。搜索/simi 全空时**兜底用收藏曲库**（过滤已排除的），保证尽量有候选。
4. **返回 `track-suggestion`**：前端展示候选卡片，用户点击 → `POST /api/queue/insert-next` 写优先槽。不点即抛弃。
5. **候选空反馈**：候选仍空时打 `console.warn`（暴露 msg/playQuery/queries）并回复用户"没找到合适的，换个说法，比如直接报歌名或歌手名"，不再静默吞掉装没事。

> **历史坑**：旧实现 `playQuery` 是 LLM 自由生成的"二手翻译"，用户提的艺术家名从不进搜索（代码层无实体提取），且候选空时走空 `catch {}` 静默退化成纯文字回复，用户以为 DJ 不想理。2026-06-22 修复：prompt 约束 + 代码提取 + 收藏兜底 + 空结果反馈。


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

FakeRadio 通过预热提前生成完整 episode（含口播 TTS），让切歌秒切而非每首等 live 生成：

- **启动批量预热**：`FAKERADIO_PREWARM_STARTUP_EPISODES`（默认 10）控制启动时为当前 block 预生成多少首。后台 `void` 异步，不阻塞启动和首次播放
- **低水位补生成**：`FAKERADIO_PREWARM_LOW_WATER_MARK`（默认 2）控制剩余 ready 低于此值时触发后台补生成
- `FAKERADIO_PREWARM_ENABLED` / `FAKERADIO_PREWARM_TIME` 仅控制定时调度（日终品味推断 + tonight brief），不再批量生成 episode
- 预热结果存入 `prepared_episodes` 表
- `/api/episode/next` 和 `/api/episode/prefetch` 选歌优先级：**优先槽（用户"插到下一首"）→ prepared episode（`source: "prepared"`）→ live 推荐（`source: "live"`）**。无可用 prepared episode 时走实时生成
- 消费 prepared 后调 `ensurePreparedEpisodes()` 后台补生成（防重入，不阻塞响应）
- `appendRecommendedTracks` 只补 track 元数据进内存 queue，不生成口播；改为 fire-and-forget 不阻塞响应
- 预热后自动尝试下载歌曲音频到 `user/audio/` 目录

### 优先槽（priority next track）

`PlaybackState` 持有一个与推荐缓冲池 `queue` **分离**的优先槽 `priorityNextTrack`，用于承载用户在 DJ 聊天里点确认"插到下一首"的曲目。它拥有最高播放优先级：

- `POST /api/queue/insert-next` 写入优先槽（不再 unshift 进 `queue`），并从 `queue` 去重移除同一首
- `/api/episode/next` 和 `/api/episode/prefetch` 顶部先消费优先槽：next 路由 `music.resolve` 后清槽并组装 episode；prefetch 路由返回但不清槽（等前端接续播放时 `/api/episode/playing` 按 id 匹配清槽，避免预取结果被丢弃时丢歌）
- `resolveNextTrackAndDecision` 把优先槽曲目 id 加入推荐排除集，防止推荐引擎把它当候选再选一次导致连播两遍
- 前端 `editorial-radio.handleConfirmSuggestion` 在 `insertNextTrack` 成功后调 `playback.refreshPrefetch()`：等在途预取结束 → 清掉旧 `nextEpisodeRef` → 重新预取，让 UP NEXT 立即显示选中曲目

> 这个槽位是为修复「DJ 说插到下一首了但实际没插入」而引入的。根因：旧实现把歌 unshift 进 `queue`，但 player 切下一首走 prewarm/推荐，`queue` 仅作最后兜底几乎永远轮不到；推荐引擎还把 `queue` 里的歌排除掉。独立优先槽 + 端点优先消费 + 前端刷新预取三层一起才真正打通。

## 导出管道

FakeRadio 有两条独立的导出路径，逻辑相同但触发方式不同：

| 端点 | 模式 | 用途 |
|------|------|------|
| `POST /api/export/today` | 异步（202 + taskId 轮询） | 把当日实际播放过的曲目按时间顺序串成一期可发布素材 |
| `POST /api/projects/:id/export` | **同步**（200 直接返回 `{ downloadUrl, blocksCount, showMp3Size }`） | 把已完成的主题节目（ShowProject）导出为 ZIP |

两条路径均产出：`show.mp3`（混音后的整期音频）+ `show-notes.md`（DJ 故事文案）+ `production-trace.jsonl`（可选脱敏 trace）。

### 逐 episode 混音（2026-06-24 调整）

老实现用 `ffmpeg -f concat` 把 TTS 口播和歌曲音轨**裸串接**，导致口播和音乐同时全音量重叠、听不清。新实现走"逐 episode 混音 → concat 整期"两阶段：

1. **混音单 episode**（`server/src/export/audio-mixer.ts:mixEpisodeAudio`）：
   - 口播全程全音量（不淡出）
   - 音乐 `adelay` 到口播结束前 1 秒开始，`afade=t=in` 在 3 秒内线性渐入到全音量
   - `amix=normalize=0` 叠加两路，输出 libmp3lame/192k/44100/stereo
   - 输出总长 = max(ttsDuration, ttsDuration - 1 + musicDuration)
2. **concat 整期**：所有 segment 统一格式后 `ffmpeg -f concat -c copy` 无损快拼成 show.mp3
3. **清理**：拼完删 segment-*.mp3 中间文件

> 历史坑：早期用 `acrossfade` 衔接，它会同时把口播尾部淡出，用户听到的是"DJ 最后一句越说越轻"。已改为非对称 filter（口播不动 / 音乐渐入）。

### 音乐文件解析

ShowProject 导出走 `trackRegistry + audioDir` 解析本地 mp3（与 `exportToday` 对齐），不依赖 episode JSON 里那串可能过期的远端 audioUrl：

- 优先按 `trackId` 找 `audioDir` 里的本地缓存
- 没缓存 → 用 `music.resolve()` 拿当前可用的 audioUrl → 按需 `downloadToFile` 流式落盘
- 第一次下载 403/失败 → 再 resolve 一次刷新 URL → 重试

后台 worker 生成的 episode 用户从未在播放器里播过，第一次导出时本地必然没缓存，必须能按需下载。

## 收藏与推荐

收藏歌曲参与推荐，但不再作为默认播放池：

- `user/netease-liked-songs.raw.json` 存储网易云「我喜欢的音乐」导出数据
- `liked-songs-repository.ts` 提供加载、诊断和随机采样
- Recommendation Engine 把收藏歌曲作为 taste seed，优先扩展相似歌曲和符合当前时段/天气/日程的策划候选
- 收藏原曲会被排除在常规候选之外，只有策划推荐、search 和队列都不可用时才作为最终兜底
- LLM 可从候选列表中指定曲目（`rerankSource: "llm-pick"`），否则走确定性兜底
- `/api/next` 的 `diagnostics` 字段暴露 `candidateSource`、`rerankSource`、`favoritesAvailable`、`signals`、`queries`、`seedCount` 等诊断信息
