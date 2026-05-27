# 30 export-pipeline 在请求中执行重型 FFmpeg 操作

Status: completed
Type: performance

## Parent

- 代码审查：`FakeRadio/server/src/export/export-pipeline.ts`

## What to build

`exportToday` 在 HTTP 请求处理器中被同步调用（`/api/export/today` 和 `/api/chat` 的 export-episode intent），内部对每首歌执行 FFmpeg 音频转码（192k/44100Hz/stereo），然后拼接所有音频并打包 ZIP。

这些操作是 CPU 密集型的，会阻塞 Fastify 事件循环，导致其他请求延迟。当收藏曲目较多时（>5 首），请求可能超时。

建议：

1. 将 `exportToday` 改为后台任务，立即返回 `202 Accepted` + 任务 ID。
2. 前端通过轮询或 WebSocket 获取导出进度（`ExportProgress` 回调已存在但未被使用）。
3. 或至少在单独的 worker thread 中执行 FFmpeg 操作。

## Acceptance criteria

- [ ] `/api/export/today` 不再阻塞等待 FFmpeg 完成
- [ ] 支持进度查询或 WebSocket 进度推送
- [ ] FFmpeg 失败时有明确的错误反馈
- [ ] 导出过程中其他 API 请求不受阻塞

## Blocked by

None — can start immediately

## Verification

在导出过程中同时调用 `/api/now`，验证响应时间不受影响。

## Comments

- `ExportProgress` 回调已经定义了 `phase` 和 `percent`，但当前 HTTP handler 没有使用。
- 最简方案：返回 202 + 任务 ID，前端轮询 `/api/export/status/:taskId`。
