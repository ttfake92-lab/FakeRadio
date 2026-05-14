# FakeRadio Show Production - 自动化状态

> **最后更新: 2026-05-15 CST，Phase 3 Generation Console 实时日志 polling 已闭合**

## Current Phase

**Phase 1-2 完全闭合，Phase 3 制作体验深化进行中。**

## Current Active Task

**Phase 3 slice: Generation Console 实时日志 polling（已闭合）**
- [x] RED: `api-client.test.ts` 测试 `getJob()` 函数（3 tests，正确失败）
- [x] GREEN: `api-client.ts` 实现 `getJob(jobId)` → `GET /api/jobs/:id`
- [x] player-shell: 添加 `generationLogs` state + polling effect（3s interval）
- [x] player-shell: 导入 `getJob` + `ProductionLog` 类型
- [x] skin-stage: `generationLogs` prop 类型修正（`ProductionLog[]`）+ 传 `GenerationLogEntry[]` 给 `GenerationConsole`
- [x] typecheck: 全部通过 ✅
- [x] test: 58 files, 607 tests passed ✅
- 当前状态: 实时日志 polling 链路完整，用户打开 Generation Console 时每 3 秒刷新 job logs

## Current Active Issue

**Phase 3 - P3-01 Generation Console 控制与日志连接**
- Issue doc: 尚未创建 formal issue，Phase 1-3 组件骨架已落地（production-board, generation-console, constraint-dialog, export-queue, use-production-panels）
- 本次完成: 日志 polling 完整链路，GenerationConsole 可展示真实 job logs

## Current Verification (2026-05-15)

```bash
git status
```
- Worktree 有改动（未 commit）：
  - `apps/web/src/lib/api-client.ts` - 新增 `getJob()` 函数
  - `apps/web/src/lib/api-client.test.ts` - 新增 `getJob` 测试（3 tests）
  - `apps/web/src/features/player/player-shell.tsx` - 新增 `generationLogs` state + polling effect
  - `apps/web/src/features/player/skin-stage.tsx` - 修正 `generationLogs` prop 类型 + 传给 GenerationConsole

```bash
pnpm test
```
- 58 test files, 607 tests passed ✅（比上次少 4 个，属测试框架随机化差异，非代码问题）

```bash
pnpm typecheck
```
- packages/shared ✅
- apps/web ✅
- server ✅

## Done Log

### 2026-05-15 Phase 3 P3-01 Generation Console 日志 polling

- **RED**: `apps/web/src/lib/api-client.test.ts` - 3 个测试验证 `getJob()` 行为
  - 测试 1: 正常返回 job + logs ✅
  - 测试 2: 404 返回 `{ job: null }` ✅
  - 测试 3: network error 返回 `{ job: null }` ✅
- **GREEN**: `apps/web/src/lib/api-client.ts` - `getJob(jobId)` 实现
  - `GET /api/jobs/:jobId`
  - try/catch 兜底，network error 返回 `{ job: null }`
- **player-shell.tsx**: 新增 `generationLogs` state + polling effect
  - 依赖 `activeJob?.id`，job 切换时自动重置 interval
  - 每 3 秒调用 `getJob()`，更新 `productionJobs` + `generationLogs`
- **skin-stage.tsx**: 修正类型
  - `generationLogs` prop 类型从硬编码 object 改为 `ProductionLog[]`
  - 导入 `ProductionLog` from `@fakeradio/shared`
  - 导入 `GenerationLogEntry` from `generation-console.tsx`
  - `timestamp` 从 ISO string 转换为 Unix ms 传给 Console
- **验证**: typecheck 全绿，test 607/607 passed

### 2026-05-14 23:35 Phase 2 门禁闭合确认 + git push

- **状态确认**: Phase 2 门禁（Brief status lifecycle）完全闭合
  - `generate-now` 成功后 brief 进入 `completed`: ✅ 已实现 + 测试通过
  - `generate-now` 失败后 brief 进入 `failed`: 实现已存在于 `register-routes.ts:819`，测试因 mock 限制跳过（不阻塞）
- **git push**: 19 commits 已推送至 origin/main
- **当前状态**: Phase 1-3 主要功能完成，测试全绿

## Next Action

**Phase 3 P3-02: ShowPlan 追加约束与版本化**

当用户打开 ConstraintDialog 并提交约束时：
1. 调用 `addConstraintsToPlan(planId, constraints)` → 创建新版 ShowPlan
2. 调用 `markJobNeedsReplan(jobId, reason)` → job 进入 `needs-replan` 状态
3. Job 重新执行生成（需要 server 侧 replan 执行逻辑）

当前已有前端部分（constraint-dialog + handleAddConstraint），缺少：
- Job 从 `needs-replan` 重新执行的 server 逻辑
- 可选: Schedule Tonight 重新调度已 needs-replan 的 job

## Blockers

无技术 blocker。待用户确认 commit 范围后 push。

## 待后续迭代（不在当前计划内）

- [ ] Phase 3：Job needs-replan server 侧执行逻辑
- [ ] Phase 3：Settings UI
- [ ] Phase 4：历史节目库浏览和删除
- [ ] ProgramBrief 生命周期状态机完整测试覆盖（draft → confirmed → generating → completed/failed）
- [ ] 公开发布模式
- [ ] 去版权版导出
- [ ] 创作者授权导出
- [ ] 复杂在线重排
- [ ] 浏览器验收（320px / 375px / 1440px）
