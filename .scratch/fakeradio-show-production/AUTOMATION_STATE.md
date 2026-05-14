# FakeRadio Show Production - 自动化状态

> **最后更新: 2026-05-15 CST，Phase 3 P3-01 已 commit，Next Action 需要用户决策**

## Current Phase

**Phase 1-2 完全闭合，Phase 3 制作体验深化进行中。**

## Current Active Task

**Phase 3 P3-01 Generation Console 实时日志 polling（已闭合 ✅，已 commit）**
- [x] RED: `api-client.test.ts` 测试 `getJob()` 函数（3 tests，正确失败）
- [x] GREEN: `api-client.ts` 实现 `getJob(jobId)` → `GET /api/jobs/:id`
- [x] player-shell: 添加 `generationLogs` state + polling effect（3s interval）
- [x] player-shell: 导入 `getJob` + `ProductionLog` 类型
- [x] skin-stage: `generationLogs` prop 类型修正（`ProductionLog[]`）+ 传 `GenerationLogEntry[]` 给 `GenerationConsole`
- [x] typecheck: 全部通过 ✅
- [x] test: 58 files, 607 tests passed ✅
- [x] git commit: `acf4cb4` ✅

## Current Active Issue

**Phase 3 - P3-01 Generation Console 控制与日志连接（已闭合 ✅）**
- Issue doc: `.scratch/fakeradio-show-production/issues/p3-01-generation-console-controls.md`
- 前端控制 API 函数（pauseJob, resumeJob, cancelJob, markNeedsReplan）和回调链已完整连接
- Generation Console 实时日志 polling 完成，用户打开 Console 时每 3 秒刷新 job logs
- P3-02 ShowPlan 追加约束前端部分也已完整（constraint-dialog + handleAddConstraint）

## Current Verification (2026-05-15)

```bash
git status
```
- Worktree 干净，commit `acf4cb4` 已完成

```bash
pnpm test
```
- 58 test files, 607 tests passed ✅

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
- **git commit**: `acf4cb4` Phase 3 P3-01: Generation Console 实时日志 polling

### 2026-05-14 23:35 Phase 2 门禁闭合确认 + git push

- **状态确认**: Phase 2 门禁（Brief status lifecycle）完全闭合
  - `generate-now` 成功后 brief 进入 `completed`: ✅ 已实现 + 测试通过
  - `generate-now` 失败后 brief 进入 `failed`: 实现已存在于 `register-routes.ts:819`，测试因 mock 限制跳过（不阻塞）
- **git push**: 19 commits 已推送至 origin/main
- **当前状态**: Phase 1-3 主要功能完成，测试全绿

## Next Action

**Phase 3 制作体验深化已前端闭环。Next Action 有两个方向，需要用户决策：**

### 方向 A：Job needs-replan server 侧执行逻辑（阻塞追加约束完整闭环）
当前前端追加约束后 job 进入 `needs-replan` 状态，但 job 不会自动重新执行。

实现方案（最小可验证 slice）：
1. 在 `/api/jobs/:id/start` 或 scheduler loop 中检测 `needs-replan` 状态并重启 job
2. 写测试验证：job 被标记 needs-replan 后，调用 start API 能重新执行

涉及文件：
- `server/src/show/show-generation-job.ts` - job registry
- `server/src/http/register-routes.ts` - `/api/jobs/:id/start`
- `server/src/scheduler/scheduler-loop.ts` - 可选：scheduler 自动消费 needs-replan job

### 方向 B：Settings UI（Phase 3 另一个验收项）
PRD 验收条件之一：Settings 能控制外部资料研究、provider、音色、trace 隐私。

涉及文件：
- `apps/web/src/features/show/` - 新建 settings-panel 组件
- `apps/web/src/lib/api-client.ts` - 新增 settings API 函数
- `server/src/http/register-routes.ts` - Settings API

## Blockers

**无技术 blocker。Next Action 需要用户确认方向 A 或 B，或两者皆做。**

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
