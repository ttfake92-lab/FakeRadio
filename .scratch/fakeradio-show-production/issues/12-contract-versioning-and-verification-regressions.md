# 12 Contract、版本化与验收回归

Status: open
Opened: 2026-05-14

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 1-4 完成门禁

## What to fix

2026-05-14 审计发现当前 “Phase 1-4 全部完成” 状态仍有 contract 与版本化回归。实现 agent 必须先修这些问题，再重新声明主线完成。

## Findings

### 1. 前端 query contract 与 server route 不一致

前端：

- `getShowPlans(briefId)` 请求 `/api/plans?briefId=...`
- `getShowJobs(briefId)` 请求 `/api/jobs?briefId=...`

后端：

- `GET /api/plans` 忽略 query，返回所有 plans。
- `GET /api/jobs` 忽略 query，返回所有 jobs。

这会导致 Production Board / Generation Console 在多节目、多 brief 场景展示错误的 plan/job。

### 2. ShowPlan 追加约束没有生成同一计划的新版本

`generateFromPlan()` 当前创建新 `ShowPlan.id`，但 repository 只按同一个 id 失活旧版本。因此追加约束后可能出现多个 active plan，且 scheduler / generate-now 读取 `plans[0]` 时不稳定。

### 3. Generate now 与 scheduler 的默认资料 adapter 策略不一致

`generate-now` 默认塞入 mock public/web source adapter，scheduler 默认传 `undefined`。两条路径虽复用 `executeScheduledJob()`，但默认来源、trace、故事类型可能不同。

### 4. E2E / 浏览器验收仍被环境阻断

本轮审计验证：

- `pnpm --filter @fakeradio/server build` 通过。
- `tsx` 注入验证失败：`listen EPERM ... tsx-501/*.pipe`。
- 编译后 Node 注入验证失败：Node 25 导入 `edge-tts/index.ts` 触发 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。

真实 HTTP 用户流和浏览器点击流仍未完成，不能关闭 HITL blocker。

## Acceptance criteria

- [ ] `GET /api/plans?briefId=...` 只返回该 brief 的 plans；不带 query 时保留列表语义。
- [ ] `GET /api/jobs?briefId=...` 只返回该 brief 的 jobs；不带 query 时保留列表语义。
- [ ] 前端 `getShowPlans()` / `getShowJobs()` 与 server contract 对齐，并有用户流级验证覆盖多 brief 不串台。
- [ ] `generateFromPlan()` 生成同一 `ShowPlan.id` 的新 version；旧版本失活；同一 brief 的 active plan 选择稳定。
- [ ] 追加约束后 Production Board / Generation Console 使用新 active plan，不展示旧版本。
- [ ] `generate-now` 与 scheduler 默认 adapter 策略一致；没有真实 provider 时不偷偷访问外网，并在 trace 中记录 mock / disabled fallback。
- [ ] 真实 HTTP 用户流可验证：聊天创建 Brief -> Generate now -> completed Brief/job -> ready Project -> export fast-fail 或 export success。
- [ ] 浏览器验收 blocker 保持打开，直到 320px / 375px / 1440px 的 Production Board、Generation Console、Export Queue 通过本地验收。

## Suggested implementation order

1. 修 server query filter：`/api/plans` 和 `/api/jobs` 支持 `briefId` query。
2. 修 `ShowPlanGenerator.generateFromPlan()` 和 repository 测试，确保 versioning 语义正确。
3. 修前端 active plan/job 选择，避免多 brief 串台。
4. 统一 adapter fallback 策略，并记录 trace 摘要。
5. 解决当前验证环境问题或提供可执行 HITL checklist，完成后再关闭本 issue。

## Blocked by

None. 这是完成声明前的回归门禁。

## Type

AFK + HITL verification

