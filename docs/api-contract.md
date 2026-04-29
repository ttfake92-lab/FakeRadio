# FakeRadio API Contract

## HTTP

- `GET /api/health`：返回 server 和 adapter 状态。
- `GET /api/now`：返回当前播放、DJ 口播和队列。
- `GET /api/next`：计算下一首歌，返回 DJ 决策、歌曲和 TTS 结果。
- `POST /api/chat`：向 DJ 发送自然语言消息。
- `GET /api/taste`：返回规范化用户品味。
- `GET /api/plan/today`：返回当天电台计划。

## WebSocket

- `WS /stream`：发送 now-playing、queue-updated、dj-speech、diagnostic 事件。

所有 payload 以 `packages/shared/src/contracts` 和 `packages/shared/src/events` 为准。
