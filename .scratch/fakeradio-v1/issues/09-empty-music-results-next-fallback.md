# 09 空音乐结果时 `/api/next` 可控失败或回退

Status: ready-for-human
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

当当前 music adapter 的 `recommend()` 和 `search()` 都返回空数组时，`GET /api/next` 不能因为 `queue[0]` 为 `undefined` 而返回未处理的 500。系统应提供一个可解释的行为：优先回退到 mock 曲目，或返回带明确原因的受控错误。

推荐实现方向：对本地电台体验优先，使用 mock music adapter 做单次兜底，并让 `decision.reason` 或诊断信息说明发生了真实来源空结果回退。

## Acceptance criteria

- [ ] `music.search()` 返回空数组且启动队列为空时，`GET /api/next` 不再抛出 `Cannot read properties of undefined`
- [ ] 行为在 contract 层可校验：返回成功的 mock fallback 结果，或返回明确的 4xx/5xx 受控错误 payload
- [ ] 新增 server 测试覆盖空 `recommend()` + 空 `search()` 的路径
- [ ] 不把网易云 provider 专有细节写进核心 DJ brain 或 scheduler

## Blocked by

- None - can start immediately

## Verification

- 2026-05-01 最小复现：注入 `recommend: async () => []`、`search: async () => []` 的 music adapter 后请求 `/api/next`，当前返回 `500`，body 包含 `Cannot read properties of undefined (reading 'title')`。
- 2026-05-01 修复后验证：`GET /api/next` 已在空 `search` + 空 `queue` 时回退 mock 曲目；`pnpm test` 通过，server 测试包含 `falls back to mock track when search and queue are empty`。

## Comments

- 2026-05-01 implementation update:
  - `/api/next` 先用候选曲目，再用启动队列，最后单次回退 `createMockMusicAdapter()`。
  - grounded `toolResults` 会追加 `music.fallback: used mock adapter due to empty results`。
  - 等待人工验收与归档。
