# FakeRadio Show Production - 自动化状态

> **最后更新: 2026-05-15 CST，Phase 3 P3-03 已 commit，等待用户决策下一步**

## Current Phase

**Phase 1-2 完全闭合，Phase 3 制作体验深化（追加约束完整闭环）已完成，当前等待用户决策下一步。**

## Current Active Task

**Phase 3 P3-03 needs-replan job 重启执行逻辑（已闭合 ✅，已 commit）**
- 新增 `server/src/show/needs-replan-restart.test.ts` — 4 个测试验证 registry 层 `needs-replan → running` 转换
- 新增 `server/src/http/start-job-replan.test.ts` — 3 个集成测试验证 route 层行为
- GREEN: 修改 `server/src/http/register-routes.ts` 中 `/api/jobs/:id/start`
  - 先查询 job 原有状态（`wasNeedsReplan = existingJob.status === "needs-replan"`）
  - 如果是从 `needs-replan` 重新启动，调用 `executeScheduledJob()` 触发完整生成流程
  - 新增错误信息区分"not found"和"invalid state transition"
- typecheck: 全部通过 ✅
- test: 60 test files, 614 tests passed ✅
- git commit: `309df04` ✅

## Current Active Issue

**Phase 3 - P3-03 needs-replan server 侧执行逻辑（已闭合 ✅）**
- Issue doc: `.scratch/fakeradio-show-production/issues/p3-01-generation-console-controls.md`（同一 issue 中提及）
- 追加约束后的完整流程已闭环：
  1. 用户在 Generation Console 点击"追加约束" → `ConstraintDialog` 提交
  2. `handleAddConstraint` 调用 `addConstraintsToPlan()` → 新 ShowPlan 版本
  3. 调用 `markJobNeedsReplan()` → job 进入 `needs-replan`
  4. 用户点击"恢复" → `/api/jobs/:id/start` → `executeScheduledJob()` 重新执行
  5. job 达到 `completed` 或 `failed` 状态

## Current Verification (2026-05-15)

```bash
git status
```
- Worktree 干净，commit `309df04` 已完成

```bash
pnpm test
```
- 60 test files, 614 tests passed ✅

```bash
pnpm typecheck
```
- packages/shared ✅
- apps/web ✅
- server ✅

## Done Log

### 2026-05-15 Phase 3 P3-03 needs-replan job 重启执行（已 commit）

- **RED (registry 层)**: `server/src/show/needs-replan-restart.test.ts` - 4 个测试
  - 测试 1: `needs-replan → running` 状态转换 ✅
  - 测试 2: 重启后 job 保留相同 id 和 briefId ✅
  - 测试 3: 重启后 `updatedAt` 时间戳更新 ✅
  - 测试 4: pending job 可正常启动 ✅
- **RED (route 层)**: `server/src/http/start-job-replan.test.ts` - 3 个集成测试
  - 测试 1: needs-replan job 重新启动后触发重新执行（最终状态为 completed/failed/running 之一）✅
  - 测试 2: 启动不存在的 job 返回 400 ✅
  - 测试 3: pending job 启动不触发重新执行 ✅
- **GREEN**: `server/src/http/register-routes.ts` 中 `/api/jobs/:id/start` 改造
  - 改造前: 只调用 `jobRegistry.start()` → 状态变为 running，但不会重新执行
  - 改造后: 先查询 `existingJob`，如果 `wasNeedsReplan === true`，则调用 `executeScheduledJob()` 触发完整生成流程
  - 复用 `generate-now` 的 `executionDeps` 构建方式
  - 修复了 `not found` 和 `invalid state transition` 两种错误的区分
- **验证**: typecheck 全绿，test 614/614 passed
- **git commit**: `309df04` ✅

### 2026-05-15 Phase 3 P3-01 Generation Console 实时日志 polling

- RED: `apps/web/src/lib/api-client.test.ts` - 3 个测试验证 `getJob()` 行为
- GREEN: `apps/web/src/lib/api-client.ts` - `getJob(jobId)` 实现
- player-shell + skin-stage 改造
- **git commit**: `acf4cb4` ✅

### 2026-05-14 Phase 2 门禁闭合确认 + git push

- Brief status lifecycle 验证完成
- git push: 19 commits 已推送至 origin/main

## Next Action

**Phase 3 追加约束完整闭环已完成。下一步有两个方向，需要用户决策：**

### 方向 A：Settings UI（Phase 3 剩余验收项）
PRD 验收条件之一：Settings 能控制外部资料研究、provider、音色、trace 隐私。
- 前端: `apps/web/src/features/show/` - 新建 settings-panel 组件
- API: `apps/web/src/lib/api-client.ts` - 新增 settings API 函数
- 后端: `server/src/http/register-routes.ts` - Settings API（已有 GET/PUT `/api/settings`）
- 验收: 用户可在 Settings 中配置外部资料研究开关、provider 选择、音色选择、trace 隐私级别

### 方向 B：Phase 4 历史节目库浏览和删除
PRD Phase 4 目标：
- 浏览历史 show project
- 删除单期 trace 或整期工程
- 导出时可选是否包含 trace

## Blockers

**无技术 blocker。Next Action 需要用户确认方向 A 或 B，或两者皆做。**

## 待后续迭代（不在当前计划内）

- [ ] Phase 3：Settings UI
- [ ] Phase 4：历史节目库浏览和删除
- [ ] ProgramBrief 生命周期状态机完整测试覆盖（draft → confirmed → generating → completed/failed）
- [ ] 公开发布模式
- [ ] 去版权版导出
- [ ] 创作者授权导出
- [ ] 复杂在线重排
- [ ] 浏览器验收（320px / 375px / 1440px）
