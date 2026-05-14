# 14 Active Brief UI 控制与 Browser Gate 回归

Status: open
Opened: 2026-05-14

## Parent

`.scratch/fakeradio-show-production/PRD.md` - Phase 1-4 完成声明门禁

## Problem

Issue 12/13 已推进多 brief query filter、BriefSelector 和 trace redaction，但 2026-05-14 14:21 审核发现完成声明仍过早：

1. `SkinStage` 的展示层已经按 `activeBriefId` 过滤 active plan、active job 和 Export Queue，但 `PlayerShell` 里的控制 handler 仍使用未按 active brief 过滤的全局 `activePlan` / `activeJob`。
2. `ProductionBoard` 仍从传入的全量 `jobs` / `projects` 中选第一个 completed job/project，可能导出或删除另一个 brief 的 project。
3. 本轮 live HTTP / browser gate 无法复现，不能把历史 320px / 375px / 1440px 验收继续当作当前事实。

## Evidence

### 1. Generation Console 控制可能操作错 brief

`apps/web/src/features/player/skin-stage.tsx` 局部过滤了展示用 active job：

- `activeJob` 来自当前 `activeBrief.id` 的 `jobsForBrief`
- `GenerationConsole` 的 `jobStatus` 使用这个局部 `activeJob`

但 `GenerationConsole` 的控制回调仍来自 `PlayerShell`：

- `apps/web/src/features/player/player-shell.tsx` 的 `activeJob` 是 `productionJobs.find(active)` 或 `productionJobs[0]`
- `handlePauseJob` / `handleResumeJob` / `handleCancelJob` 都操作这个全局 `activeJob`
- 如果 brief A 和 brief B 都有 job，当前展示的是 brief B，但全局第一个 active job 属于 brief A，用户点击暂停/取消会操作错 job

### 2. 追加约束可能写到错 plan

`apps/web/src/features/player/player-shell.tsx` 的 `activePlan` 是 `productionPlans.find((p) => p.active)`，没有按 `activeBriefId` 过滤。`handleAddConstraint()` 调用 `addConstraintsToPlan(activePlan.id, constraints)`，因此可能给另一个 brief 的 active plan 生成新版本。

### 3. Export Package 可能选择错 project

`apps/web/src/features/show/production-board.tsx`：

- `completedJob = jobs?.find((j) => j.status === "completed")`
- `activeProject` 使用 `completedJob.activeJobId` 或 `completedJob.briefId` 在全量 `projects` 中选择
- `SkinStage` 传入 `ProductionBoard` 的 `jobs={productionJobs ?? []}` 与 `projects={productionProjects ?? []}` 是全量列表

结果是 active brief 的 board 可能显示/导出另一个 brief 的 completed project。

### 4. Live/browser gate 未复现

本轮验证：

```bash
curl --noproxy '*' -I --max-time 5 http://127.0.0.1:3302/
curl --noproxy '*' -I --max-time 5 http://127.0.0.1:3301/api/health
nc -vz -w 3 127.0.0.1 3302
```

结果：

- `curl`: Failed to connect
- `nc`: Operation not permitted

因此不能声明当前 checkout 的 live dev server / browser 验收通过。

## Acceptance Criteria

- [x] `PlayerShell` 中用于 pause/resume/cancel/add-constraints 的 `activeJob` / `activePlan` 必须按 `activeBriefId` 过滤。
- [x] `ProductionBoard` 只接收或只使用当前 brief 范围内的 jobs/projects；切换 brief 后清理不属于当前 brief 的 `selectedProjectId`。
- [x] Export Queue、Production Board、Generation Console 在同一个 active brief 上显示、控制和导出。
- [x] 增加多 brief 用户流级覆盖：两个 Theme Show brief 各自 plan/job/project，切换后不会显示或操作另一个 brief。
- [ ] 重新完成 live API/page 访问验证；若环境阻断，状态文件必须保留 blocker，不能声明 browser gate 已过。
- [ ] 重新完成 320px / 375px / 1440px 浏览器验收或等价用户流证据。

## Status Update 2026-05-14 15:35

实现已全部完成并验证通过：

- `PlayerShell` 的 `activePlan` 和 `activeJob` 现在都按 `activeBriefId` 过滤。
- `ProductionBoard` 的 `jobsForBrief` / `projectsForBrief` 按 `brief?.id` 过滤；切换 brief 后 `selectedProjectId` 跨 brief 清空。
- 新增前端测试：`player-shell-brief-filter.test.ts`（5 tests）和 `production-board-multi-brief.test.ts`（7 tests）。
- 新增服务端测试：`server/src/http/multi-brief-filter.test.ts`（5 tests）。
- 全量 585 测试通过，`pnpm typecheck` 通过。

剩余 blocker：live browser gate（端口访问受限）、320px/375px/1440px 浏览器验收。

## Suggested Implementation Order

1. 先修 `PlayerShell` 的 active plan/job 推导和 handler 依赖。
2. 再修 `ProductionBoard` 的 job/project 过滤与切换 brief 后 selected project 清理。
3. 增加多 brief 用户流覆盖，优先验证 handler 操作对象和 export project id。
4. 重启或修复本地 dev server 可访问性。
5. 完成浏览器尺寸验收后再关闭本 issue。

## Blocked by

本轮 live/browser 验证被本地网络访问限制阻断；实现 agent 需要在可访问本地端口的环境中重新验证。

## Type

Regression / user-flow contract / HITL gate
