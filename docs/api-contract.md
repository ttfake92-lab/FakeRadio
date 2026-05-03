# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。当前至少包含 `adapters.llm`、`adapters.music`、`adapters.tts`、`adapters.weather`、`adapters.calendar`、`adapters.upnp`。其中 `adapters.music` 当前会返回 `ready` 或 `mock`。
- `GET /api/now`：返回当前播放、DJ 口播和队列。`track.source` 与 `queue[].source` 会直接告诉前端当前曲目来自 `netease` 还是 `mock`。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲和 TTS 结果。当前实现会先生成 draft query，再基于真实曲目生成 grounded `decision.say` / `decision.reason`。选择曲目时会优先避开当前正在播放的曲目；真实搜索和队列都为空时会单次回退到 mock 曲目。TTS provider 失败时会回退到 mock TTS，避免主流程返回未处理的 500。
- `POST /api/chat`：向 DJ 发送自然语言消息。
- `GET /api/taste`：返回规范化用户品味。
- `GET /api/plan/today`：返回当天电台计划。`blocks[]` 当前包含 `at`、`label` 和 `moodHint`，供 scheduler 和前端共同消费。
- `GET /api/episode/next`：story-first 电台接口。返回 `RadioEpisode`，包含 `track`（下一首曲目）、`story`（故事文案、TTS 音频、故事类型）、`sources[]`（资料来源与证据摘要）、`playback`（crossfade 与音量参数）和 `fallbackReason`（TTS 或资料源回退原因）。故事类型按证据门槛分级：`background`（有公开元数据或网页研究支撑）→ `lyric-theme`（有歌词支撑）→ `mood-reading`（资料不足时的情绪解读）。

## WebSocket

- `WS /stream`：发送 `now-playing`、`queue-updated`、`dj-speech`、`diagnostic` 事件。

当前事件用途：

- `now-playing`：前端同步最新 `NowResponse`
- `queue-updated`：前端同步当前队列
- `dj-speech`：前端同步最新 DJ 口播文本和音频
- `diagnostic`：前端展示 stream 连接和运行诊断

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
