# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。当前至少包含 `adapters.llm`、`adapters.music`、`adapters.tts`、`adapters.weather`、`adapters.calendar`、`adapters.upnp`。其中 `adapters.music` 当前会返回 `ready` 或 `mock`。
- `GET /api/now`：返回当前播放、DJ 口播和队列。`track.source` 与 `queue[].source` 会直接告诉前端当前曲目来自 `netease` 还是 `mock`。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲、TTS 结果和诊断信息。`diagnostics` 字段包含：`candidateSource`（favorites/search/queue/mock）、`rerankSource`（llm-pick/fallback）、`favoritesAvailable`（收藏曲目数）、`candidatesCount`（候选总数）、`isFallback`（是否使用 mock 兜底）、`musicProvider`（当前音乐来源）。LLM 可从候选曲目列表中选择曲目，选中时 `rerankSource` 为 `llm-pick`，否则走确定性兜底。TTS provider 失败时会回退到 mock TTS，避免主流程返回未处理的 500。
- `POST /api/chat`：向 DJ 发送自然语言消息。
- `POST /api/chat/stream`：SSE 流式聊天端点。请求体同 `/api/chat`（`{ message: string }`），返回 `text/event-stream`。事件类型：`event: chunk`（句子片段，data 为 string）、`event: done`（最终结果，data 为 `{ text: string, action?: { type: "next-track" | "add-favorite", trackId?: string, title?: string, artist?: string } }`）。前端通过 `useChatSSE` hook 消费该流。
- `GET /api/taste`：返回规范化用户品味。
- `POST /api/taste/infer`：根据今日对话和收藏记录，自动推断并更新用户品味文件。需要今日至少有 3 条互动记录，否则返回 400。
- `GET /api/plan/today`：返回当天电台计划。`blocks[]` 当前包含 `at`、`label` 和 `moodHint`，供 scheduler 和前端共同消费。
- `POST /api/netease/login/cookie`：直接注入网易云 cookie 字符串。请求体 `{ cookie: string }`，返回 `{ success: boolean, message: string }`。当前因 music.163.com 封禁网页版二维码登录（code 8821），此接口为推荐登录方式。
- `POST /api/export/today`：启动异步节目导出任务。立即返回 `202 { taskId, status: "pending" }`，后台执行音频混音、生成 show notes 和打包 ZIP。
- `GET /api/export/status/:taskId`：查询导出任务状态。返回 `{ id, status, progress?, result?, error? }`，`status` 可能为 `pending` / `running` / `completed` / `failed`。任务完成后 `result` 中包含 `downloadUrl`。
- `GET /api/export/download/:date`：下载指定日期（`YYYY-MM-DD`）的导出 ZIP。返回 `application/zip` 附件。
- `GET /api/episode/next`：story-first 电台接口。返回 `RadioEpisode`，包含 `track`（下一首曲目）、`story`（故事文案、TTS 音频、故事类型）、`sources[]`（资料来源与证据摘要）、`playback`（crossfade 与音量参数）和 `fallbackReason`（TTS 或资料源回退原因）。故事类型按证据门槛分级：`background`（有公开元数据或网页研究支撑）→ `lyric-theme`（有歌词支撑）→ `mood-reading`（资料不足时的情绪解读）。

## WebSocket

- `WS /stream`：发送 `now-playing`、`queue-updated`、`dj-speech`、`diagnostic` 事件。

当前事件用途：

- `now-playing`：前端同步最新 `NowResponse`
- `queue-updated`：前端同步当前队列
- `dj-speech`：前端同步最新 DJ 口播文本和音频
- `diagnostic`：前端展示 stream 连接和运行诊断

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
