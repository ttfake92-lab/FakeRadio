# 36 /api/episode/next 失败时返回非 contract 的 200 响应

Status: ready-for-agent
Type: bug
Priority: P2

## Parent

- 代码审查：`server/src/http/register-routes.ts`

## What to build

`GET /api/episode/next` 当前在 handler 内 catch 所有错误，并直接返回 `{ error: message }`。由于没有设置 HTTP 错误状态，Fastify 会返回 200；同时 response body 不符合 `EpisodeNextResponseSchema`。

影响：

1. 前端 `getNextEpisode()` 会把 200 响应交给 `EpisodeNextResponseSchema.parse()`，最后报成客户端 schema parse 错误。
2. 真实失败原因（LLM、music、story source、TTS、state DB）被模糊成“播放失败/解析失败”。
3. API contract 文档承诺 `/api/episode/next` 返回 `RadioEpisode`，当前失败路径破坏 contract。

建议二选一：

1. 如果要失败：使用 `reply.status(500).send({ error: message })`，并在前端 API client 对非 2xx 进行明确错误处理。
2. 如果要稳定降级：catch 后返回合法 `EpisodeNextResponse`，例如 mock episode 或可播放 fallback episode。

## Acceptance criteria

- [ ] `/api/episode/next` 成功路径仍返回 `EpisodeNextResponseSchema` 合法 body
- [ ] `/api/episode/next` 失败路径不再返回 200 + `{ error }`
- [ ] 前端 `getNextEpisode()` 对非 2xx 响应抛出包含服务端错误信息的 Error
- [ ] 新增 server 测试覆盖 episode runner 失败时的 HTTP status
- [ ] 新增或更新 API client 测试覆盖非 2xx 错误处理

## Blocked by

None - can start immediately

## Verification

```bash
pnpm --filter @fakeradio/server test
pnpm --filter @fakeradio/web test
pnpm typecheck
```

## Comments

- 2026-05-09 code review: 当前 catch 分支返回 `{ error: message }`，但 route 没有设置非 2xx status。
