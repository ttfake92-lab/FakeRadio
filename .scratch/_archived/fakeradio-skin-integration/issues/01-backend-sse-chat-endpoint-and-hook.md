Status: completed

## Parent

- `.scratch/fakeradio-skin-integration/PRD.md`

## What to build

新增 `POST /api/chat/stream` SSE 端点和 `useChatSSE` hook。

新增文件：
- `server/src/http/chat-sse-handler.ts` — SSE handler
- `apps/web/src/features/player/use-chat-sse.ts` — 前端 SSE hook

修改文件：
- `server/src/http/register-routes.ts` — 注册 `/api/chat/stream` 路由

## Verification

```bash
pnpm --filter web test -- run 2>&1 | grep -E "passed|failed"
```
