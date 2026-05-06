# 24 Web research 结果按 episode 缓存避免重复计费

Status: needs-triage
Type: bug

## Parent

- 代码审查（2026-05-04）：`FakeRadio/server/src/http/create-server.ts:363`

## What to build

每次调用 `/api/episode/next` 都会重新创建 `webResearchAdapter` 实例并发起新的 Brave Search API 请求，即使是同一首曲目。与 TTS（有 cache manager）不同，web research 结果没有任何缓存，导致：

1. 同一首歌重复查询，浪费 Brave API 配额
2. 每次都有网络延迟

修复：为 `webResearchAdapter` 的结果添加 in-memory 缓存，以 `trackId`（或 `artist + title`）为 key，TTL 为一天（歌曲背景资料不会变化）。

## Acceptance criteria

- [ ] web research 结果以 track 标识为 key 缓存
- [ ] 同一 track 在 TTL 内不重复调用 Brave API
- [ ] TTL 过期或缓存未命中时正常发起请求
- [ ] 测试覆盖缓存命中和未命中两个路径

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
