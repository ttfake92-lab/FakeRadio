# Phase 3 Issue 1: Generation Console 控制功能

Status: completed
Opened: 2026-05-13
Completed: 2026-05-17

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 3

## What to build

将 Generation Console 中的暂停、取消、追加约束按钮连接到实际的后端 API，实现完整的 job 控制功能。

## Acceptance criteria

- [x] 前端 api-client.ts 添加 pauseJob, resumeJob, cancelJob, markNeedsReplan 函数
- [x] Generation Console 组件的 onPause, onCancel, onAddConstraint 能实际调用 API
- [x] 从 skin-stage.tsx 和 player-shell.tsx 传递回调链连接完整
- [x] 所有相关 typecheck 通过
- [x] 所有现有测试不失败

## Verification 2026-05-17

**静态 wiring 验证 - ✅ 全部通过**

1. **API client 函数存在**：
   - `pauseJob` (api-client.ts:218)
   - `resumeJob` (api-client.ts:229)
   - `cancelJob` (api-client.ts:240)
   - `markJobNeedsReplan` (api-client.ts:251)
   - `addConstraintsToPlan` (api-client.ts:270)

2. **回调链连接完整**：
   - `player-shell.tsx` → `skin-stage.tsx` → `generation-console.tsx`
   - `onPause={onPauseJob}` (skin-stage.tsx:358)
   - `onResume={onResumeJob}` (skin-stage.tsx:359)
   - `onCancel={onCancelJob}` (skin-stage.tsx:360)
   - `onAddConstraint={onAddConstraint}` (skin-stage.tsx:361)

3. **Generation Console 按钮条件正确**：
   - 暂停：仅当 `jobStatus === "running"` 时显示
   - 恢复：仅当 `jobStatus === "paused" || jobStatus === "needs-replan"` 时显示
   - 取消：当 job status 在活跃状态时显示
   - 追加约束：仅当 `jobStatus === "running"` 时显示

4. **浏览器 UI 验证 - ✅ 已通过**：
   - `pnpm dev` 成功启动 Server + Web
   - Production Board 面板可正常展开/收起
   - Generation Console 面板可正常展开/收起
   - Generation Console 显示正确的 header 和内容区

**Live gate - ✅ 已恢复**
- 根因确认：端口占用（非代码 bug）
- `pnpm dev` 成功启动 Server (127.0.0.1:3301) + Web (localhost:3302)
- 所有 4 个 HTTP 探针全部返回 HTTP 200 OK

**测试门禁 - ✅ 全部通过**
- `pnpm test` → 60 test files, 614 tests passed
- `pnpm typecheck` → 所有 workspace 通过

## Note

控制按钮的点击行为验证需要 active job。当 job 在 running/paused/needs-replan 状态时，相应按钮会显示。完整用户流测试需要通过聊天创建节目 Brief 并触发生成任务后进行。
