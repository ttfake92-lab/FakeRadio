# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。当前至少包含 `adapters.llm`、`adapters.music`、`adapters.tts`、`adapters.weather`、`adapters.calendar`、`adapters.upnp`。其中 `adapters.music` 当前会返回 `ready` 或 `mock`。
- `GET /api/now`：返回当前播放、DJ 口播和队列。`track.source` 与 `queue[].source` 会直接告诉前端当前曲目来自 `netease` 还是 `mock`。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲、TTS 结果和诊断信息。`diagnostics` 字段包含：`candidateSource`（favorites/search/queue/mock）、`rerankSource`（llm-pick/fallback）、`favoritesAvailable`（收藏曲目数）、`candidatesCount`（候选总数）、`isFallback`（是否使用 mock 兜底）、`musicProvider`（当前音乐来源）。LLM 可从候选曲目列表中选择曲目，选中时 `rerankSource` 为 `llm-pick`，否则走确定性兜底。TTS provider 失败时会回退到 mock TTS，避免主流程返回未处理的 500。
- `POST /api/chat`：向 DJ 发送自然语言消息。支持的意图：切歌（"下一首"）、收藏（"喜欢这首歌"）、节目编排（自然语言触发，如"帮我做一期后摇主题节目"、"最近在听很多 City Pop"）、品味更新、故事讲述等。节目编排支持多轮对话：创建 → 修改 → 确认。
- `POST /api/chat/stream`：SSE 流式聊天端点。请求体同 `/api/chat`（`{ message: string }`），返回 `text/event-stream`。事件类型：`event: chunk`（句子片段，data 为 string）、`event: done`（最终结果，data 为 `{ text: string, action?: { type: "next-track" | "add-favorite" | "show-brief-created" | "show-plan-refined" | "show-confirmed" | "show-cancelled", trackId?: string, title?: string, artist?: string, briefId?: string } }`）。前端通过 `useChatSSE` hook 消费该流。
- `GET /api/taste`：返回规范化用户品味。
- `POST /api/taste/infer`：根据今日对话和收藏记录，自动推断并更新用户品味文件。需要今日至少有 3 条互动记录，否则返回 400。
- `GET /api/plan/today`：返回当天电台计划。`blocks[]` 当前包含 `at`、`label` 和 `moodHint`，供 scheduler 和前端共同消费。
- `POST /api/netease/login/cookie`：直接注入网易云 cookie 字符串。请求体 `{ cookie: string }`，返回 `{ success: boolean, message: string }`。当前因 music.163.com 封禁网页版二维码登录（code 8821），此接口为推荐登录方式。
- `POST /api/export/today`：启动异步节目导出任务。立即返回 `202 { taskId, status: "pending" }`，后台执行音频混音、生成 show notes 和打包 ZIP。
- `GET /api/export/status/:taskId`：查询导出任务状态。返回 `{ id, status, progress?, result?, error? }`，`status` 可能为 `pending` / `running` / `completed` / `failed`。任务完成后 `result` 中包含 `downloadUrl`。
- `GET /api/export/download/:date`：下载指定日期（`YYYY-MM-DD`）的导出 ZIP。返回 `application/zip` 附件。
- `GET /api/episode/next`：story-first 电台接口。返回 `RadioEpisode`，包含 `track`（下一首曲目）、`story`（故事文案、TTS 音频、故事类型）、`sources[]`（资料来源与证据摘要）、`playback`（crossfade 与音量参数）和 `fallbackReason`（TTS 或资料源回退原因）。故事类型按证据门槛分级：`background`（有公开元数据或网页研究支撑）→ `lyric-theme`（有歌词支撑）→ `mood-reading`（资料不足时的情绪解读）。服务端在返回响应前会调用 `state.setDj()` 更新 DJ 状态，并通过 WebSocket 广播 `dj-speech` 和 `agent-message` 事件。故事叙述包含 `narrationMentionsTrack` 安全守卫——LLM 生成的文案若未提及所选曲目，自动回退到确定性文案。

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

## TTS

- `GET /api/tts/voices`：返回各 provider 可用音色列表，供设置页下拉。`{ mimo: [{value,label}...], edge: [{value,label}...] }`。
- `POST /api/tts/preview`：用指定参数试听合成。请求体 `{ provider: "mimo"|"edge", voice, style?, rate?, text? }`，临时构造 adapter 合成示例文本（默认「欢迎收听 FakeRadio，这是当前音色的试听。」），返回 `{ audioUrl }`（音频落 TTS 缓存，复用 `/cache/tts/*` 路由 serve）。MiMo 未配 API key 或合成失败返回 503 + `{ error }`。

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
- `POST /api/shows/generate-now`：立即生成节目。请求体 `{ briefId: string }`，同步完成从 brief 到 show 的全流程。
- `POST /api/projects/:id/export`：异步导出指定节目为 ZIP。立即返回 `202 { taskId, status: "pending" }`。
- `GET /api/export/project/:id/download`：下载指定节目导出的 ZIP 文件。

## WebSocket

- `WS /stream`：发送 `now-playing`、`queue-updated`、`dj-speech`、`agent-message`、`diagnostic` 事件。

当前事件用途：

- `now-playing`：前端同步最新 `NowResponse`
- `queue-updated`：前端同步当前队列
- `dj-speech`：前端同步最新 DJ 口播文本和音频。由 `/api/next` 和 `/api/episode/next` 两条链路广播
- `agent-message`：DJ 口播的第一句话摘要或节目编排状态通知，payload 为 `{ role: "agent", text: string, trackId?: string }`，供前端 chat 面板展示。`trackId` 为可选字段（节目编排消息不一定关联曲目）
- `diagnostic`：前端展示 stream 连接和运行诊断

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
