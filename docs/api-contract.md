# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。当前至少包含 `adapters.llm`、`adapters.music`、`adapters.tts`、`adapters.weather`、`adapters.calendar`、`adapters.upnp`。其中 `adapters.music` 当前会返回 `ready` 或 `mock`；`adapters.weather` 默认 `ready`（免 key 的 Open-Meteo 兜底，仅 `FAKERADIO_WEATHER_PROVIDER=disabled` 时为 `disabled`）。
- `GET /api/now`：返回当前播放、DJ 口播和队列。`track.source` 与 `queue[].source` 会直接告诉前端当前曲目来自 `netease` 还是 `mock`。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲、TTS 结果和诊断信息。选歌先经过 server 侧 Recommendation Engine，综合 daypart、天气、日程、`taste.md`、`mood-rules.md`、`playlists.json`、网易喜欢歌曲 seed、最近播放和当前队列。`diagnostics` 字段包含：`candidateSource`（curated/favorites/search/queue）、`rerankSource`（llm-pick/fallback）、`favoritesAvailable`（收藏曲目数）、`candidatesCount`（候选总数）、`signals`（本次使用的推荐信号）、`queries`（实际扩展出的 provider 查询）、`seedCount`（liked song seed 数）、`isFallback`、`musicProvider`。LLM 可从策划候选曲目列表中选择曲目，选中时 `rerankSource` 为 `llm-pick`，否则走确定性兜底。TTS provider 失败时会回退到本地可听 TTS，避免主流程返回未处理的 500。
- `POST /api/chat`：向 DJ 发送自然语言消息。支持的意图：切歌（"下一首"）、收藏（"喜欢这首歌"）、节目编排（自然语言触发，如"帮我做一期后摇主题节目"、"做陈奕迅的节目"、"做一期 Pink Floyd"、"策划一期粤语金曲节目"、"最近在听很多 City Pop"）、品味更新、故事讲述等。节目编排支持多轮对话：创建 → 修改 → 确认。意图 regex 详见 `server/src/show/brief-intent-parser.ts:THEME_SHOW_PATTERNS`。
- `POST /api/chat/stream`：SSE 流式聊天端点。请求体同 `/api/chat`（`{ message: string }`），返回 `text/event-stream`。事件类型：`event: chunk`（句子片段，data 为 string）、`event: done`（最终结果，data 为 `{ text: string, action?: { type: "next-track" | "add-favorite" | "track-suggestion" | "show-brief-created" | "show-plan-refined" | "show-confirmed" | "show-cancelled", trackId?: string, title?: string, artist?: string, tracks?: Track[], briefId?: string } }`）。**`type: "track-suggestion"` 表示 DJ 给出候选歌曲名单**：用户在前端对话框里点击某张候选卡片 → `POST /api/queue/insert-next` 写入优先槽 → 下次 `/api/episode/next` / `/api/episode/prefetch` 优先消费该曲目成为真正的下一首。**不点即抛弃**。候选生成逻辑：用户消息里明确提到的艺术家/歌曲名（引号内容、多词专有名词）被提取为搜索种子，与 LLM 的 `playQuery` 并列进推荐 queries 最前；搜索/相似歌全空时兜底用收藏曲库。**候选仍空时**：不返回 `track-suggestion` action，而是回复纯文字"没找到合适的，换个说法"引导用户，并在服务端打 `console.warn` 暴露 playQuery/queries 便于排查。前端通过 `useChatSSE` hook 消费该流。
- `POST /api/queue/insert-next`：DJ 候选确认插入。请求体 `{ track: Track }`，把 track 写入 `state` 的**优先槽**（`priorityNextTrack`，与推荐缓冲池 `queue` 分离的最高播放优先级槽位），并从 `queue` 去重移除同一首。广播 `now-playing` 事件（让前端立即刷新）。返回 `{ ok: true }`。**优先槽在 `/api/episode/next`、`/api/episode/prefetch` 里拥有最高消费优先级**——这是修复「DJ 说插到下一首了但实际没插入」的关键：以前 push 进 `queue` 后会被 prewarm 预生成 episode 和推荐引擎抢先消费，`queue` 仅作最后兜底几乎永远轮不到。前端 `editorial-radio` 在用户点击候选卡片时调用，并在成功后调 `playback.refreshPrefetch()` 丢掉旧预取、重新预取，让 UP NEXT 立即显示选中曲目。
- `GET /api/taste`：返回规范化用户品味。
- `POST /api/taste/infer`：根据今日对话和收藏记录，自动推断并更新用户品味文件。需要今日至少有 3 条互动记录，否则返回 400。
- `GET /api/profile`：个人资料面板数据（入口：TopBar 左上角用户头像）。返回 `{ profile, taste, routines, moodRules, tasteTags: string[], topArtists: string[], favoritesCount, likedSongsCount }`。`tasteTags` 复用推荐引擎的 `extractTasteKeywords`（面板展示的标签 = 推荐实际使用的信号）；`topArtists` 从网易喜欢歌曲按出现频次取 top 10。
- `GET /api/persona`：DJ 人设（入口：聊天区 DJ 头像）。返回 `{ base: string, override: DjPersonaOverride | null }`。`base` 是 `prompts/dj-persona.md` 全文（只读展示）；`override` 是用户自定义覆盖。
- `PUT /api/persona`：保存用户自定义 DJ 人设。请求体 `{ name?, personaText?, replyStyle?, tone? }`（全部字段为空 = 清除覆盖、恢复默认）。覆盖持久化到 SQLite pref `dj:persona`，并通过 `dj-persona-store` 单例在 `buildContextWindow` 的 system fragment 统一追加——**保存后立即对聊天回复、歌曲口播、预热生效，无需重启**。
- `GET /api/weather`：TopBar 天气行数据。返回 `{ city, summary, moodHint, temperatureC?, status: "ready"|"disabled"|"error" }`。城市来自 `settings.weatherCity`（空串回退 `FAKERADIO_WEATHER_CITY`）。
- `PUT /api/avatar/:kind`：上传头像，`kind` 为 `dj`（聊天区 DJ 头像）或 `user`（TopBar 用户头像）。请求体 `{ dataUrl: "data:image/png|jpeg|webp;base64,..." }`，解码后 ≤1MB（前端已用 canvas 压到 256px）。文件落 `user/avatars/<kind>.<ext>`。
- `GET /api/avatar/:kind`：读取头像图片（带正确 content-type，`cache-control: no-cache`）。未上传过返回 404，前端回退到文字占位（FR / AI）。
- `GET /api/plan/today`：返回当天电台计划。`blocks[]` 当前包含 `at`、`label` 和 `moodHint`，供 scheduler 和前端共同消费。
- `POST /api/netease/login/cookie`：直接注入网易云 cookie 字符串。请求体 `{ cookie: string }`，返回 `{ success: boolean, message: string }`。当前因 music.163.com 封禁网页版二维码登录（code 8821），此接口为推荐登录方式。
- `POST /api/export/today`：启动异步节目导出任务。立即返回 `202 { taskId, status: "pending" }`，后台执行音频混音、生成 show notes 和打包 ZIP。
- `GET /api/export/status/:taskId`：查询导出任务状态。返回 `{ id, status, progress?, result?, error? }`，`status` 可能为 `pending` / `running` / `completed` / `failed`。任务完成后 `result` 中包含 `downloadUrl`。
- `GET /api/export/download/:date`：下载指定日期（`YYYY-MM-DD`）的导出 ZIP。返回 `application/zip` 附件。
- `GET /api/episode/next`：story-first 电台接口。返回 `RadioEpisode`，包含 `track`（下一首曲目）、`story`（故事文案、TTS 音频、故事类型）、`sources[]`（资料来源与证据摘要）、`playback`（crossfade 与音量参数）和 `fallbackReason`（TTS 或资料源回退原因）。选歌优先级：**优先槽（用户"插到下一首"的曲目）→ prepared episode（prewarm 预生成）→ live 推荐**。服务端通过 `composeEpisodeFromTrack()` 统一完成资料收集、口播生成（含 `narrationMentionsTrack` 安全守卫）和 TTS 合成。故事类型按证据门槛分级：`background`（有公开元数据或网页研究支撑）→ `lyric-theme`（有歌词支撑）→ `mood-reading`（资料不足时的情绪解读）。

## 预热与调度

- `GET /api/prewarm/status`：返回预热状态。字段包括 `enabled`、`targetDate`、`lastRun`、`nextRunAt`、`blocks[]`（各时段 `ready`/`consumed`/`failed` 计数）。详见 `docs/local-runbook.md` 的预热章节。

## 收藏管理

- `GET /api/favorites`：返回收藏曲目列表。
- `POST /api/favorites`：添加收藏。请求体 `{ trackId: string }`。
- `DELETE /api/favorites/:trackId`：取消收藏。
- `GET /api/favorites/diagnostics`：返回收藏库加载诊断。字段包括 `loaded`（是否已加载）、`count`（曲目数）、`samples`（样本数据）。

## 音频代理

- `GET /api/audio/:trackId`：代理歌曲音频。优先读取本地 `user/audio/<trackId>.mp3` 缓存；本地缺失时自动代理远端音频并流式返回。**支持 Range 请求**：本地缓存命中返回 `206` + `Content-Range`/`Content-Length`/`Accept-Ranges`，首播透传上游 `Content-Length`。iOS Safari 必须拿到正确的 Range 响应才能 seek，否则把流当直播流、重新缓冲时从头恢复。

## 网易云认证

- `GET /api/netease/login/status`：查看当前网易云 cookie 登录状态。
- `POST /api/netease/logout`：清除当前网易云登录 cookie。

## 设置

- `GET /api/settings`：返回当前运行时设置（`SettingsSchema`）。
- `PUT /api/settings`：部分更新设置并热应用（`applySettings` 重建 adapter snapshot，无需重启）。字段含 provider/音色/语速等 TTS 项（`ttsProvider: "grok"|"mimo"|"fish"`、`ttsVoice`、`mimoVoice`、`fishVoiceId`）、netease 项、`weatherCity`（天气城市，个人资料面板可编辑，支持中文城市名）等，完整清单以 `packages/shared` 的 `UpdateSettingsRequestSchema` 为准。

## TTS

- `GET /api/tts/voices`：返回各 provider 可用音色和 Grok speech tag 风格列表，供设置页下拉。`{ mimo: [{value,label}...], grok: [{value,label}...], grokStyles: [{value,label}...] }`。Fish Audio 没有预置音色列表（音色是用户自填的 Voice ID），不在此接口返回。
- `POST /api/tts/preview`：用指定参数试听合成。请求体 `{ provider: "mimo"|"grok"|"fish", voice, style?, rate?, text? }`（Fish 的 `voice` 传 Voice ID），临时构造 adapter 合成示例文本（默认「欢迎收听 FakeRadio，这是当前音色的试听。」），返回 `{ audioUrl }`（音频落 TTS 缓存，复用 `/cache/tts/*` 路由 serve）。对应 provider 未配 API key、合成失败时返回 503 + `{ error }`。

## Show Production（节目制作）

### ProgramBrief（节目构思）

- `GET /api/briefs`：返回所有 ProgramBrief 列表。
- `GET /api/briefs/:id`：返回指定 ProgramBrief 详情。

### ShowPlan（节目计划）

- `GET /api/plans`：返回所有 ShowPlan 列表。支持 `?briefId=` 过滤。
- `GET /api/plans/:briefId`：返回指定 brief 关联的 ShowPlan 列表。
- `GET /api/plans/:briefId/active`：返回指定 brief 当前活跃的 ShowPlan。
- `POST /api/plans/add-constraints`：向已有 ShowPlan 追加约束条件。请求体 `{ planId: string, constraints: object }`。触发重新规划，生成新版本 ShowPlan。

### GenerationJob（生成任务）

- `POST /api/jobs`：创建生成任务。请求体 `{ planId: string }`。
- `GET /api/jobs`：返回所有生成任务列表。
- `GET /api/jobs/:id`：返回指定任务详情。状态包括 `pending`/`running`/`paused`/`needs-replan`/`completed`/`cancelled`/`failed`。
- `POST /api/jobs/:id/start`：启动任务。
- `POST /api/jobs/:id/pause`：暂停任务。状态从 `running` 变为 `paused`。
- `POST /api/jobs/:id/resume`：恢复暂停的任务。状态从 `paused` 变为 `running`。
- `POST /api/jobs/:id/cancel`：取消任务。
- `POST /api/jobs/:id/needs-replan`：标记任务需要重新规划。通常在追加约束后触发，任务进入 `needs-replan` 状态等待新 ShowPlan。

### ShowProject（节目成品）

- `GET /api/shows`：返回所有已完成节目列表。
- `GET /api/shows/:id`：返回指定节目详情。
- `DELETE /api/shows/:id`：删除指定节目。
- `DELETE /api/shows/:id/trace`：清除指定节目的生成追踪数据。
- `POST /api/shows/generate-now`：立即生成节目。请求体 `{ briefId: string }`，同步完成从 brief 到 show 的全流程（30-120s，取决于 block 数量）。成功返回 `201 { project, job }`；已有 active job 时返回 `202 { project, job }` 复用；失败返回 `500 { error: string, phase: "preparation"|"execution", project?, job? }`，前端可读 `error` 字段拿到具体原因（plan 生成失败 / sqlite UNIQUE 撞 / netease cookie 失效等）。
- `POST /api/projects/:id/export`：**同步**导出指定节目为 ZIP。直接返回 `200 { downloadUrl, projectId, date, blocksCount, showMp3Size? }`。导出过程逐 episode 混音（口播全程全音量、音乐在口播末尾 1 秒前 adelay + 3 秒 afade=t=in 渐入到全音量）→ concat 整期 → 写 show-notes.md → 可选 production-trace.jsonl。失败时返回 `500 { error, phase: "preparation"|"execution" }`。
- `GET /api/export/project/:id/download`：列出或下载指定节目的导出文件。query `?file=show.mp3` 下载单文件（允许 `show.mp3` / `show-notes.md` / `show-plan.json` / `production-trace.jsonl`）；不带 file 返回 `{ projectId, files: string[] }` 文件清单。

## WebSocket

- `WS /stream`：发送 `now-playing`、`queue-updated`、`dj-speech`、`agent-message`、`diagnostic` 事件。

当前事件用途：

- `now-playing`：前端同步最新 `NowResponse`
- `queue-updated`：前端同步当前队列
- `dj-speech`：前端同步最新 DJ 口播文本和音频。由 `/api/next` 和 `/api/episode/next` 两条链路广播
- `agent-message`：DJ 口播的第一句话摘要或节目编排状态通知，payload 为 `{ role: "agent", text: string, trackId?: string }`，供前端 chat 面板展示。`trackId` 为可选字段（节目编排消息不一定关联曲目）
- `diagnostic`：前端展示 stream 连接和运行诊断

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
