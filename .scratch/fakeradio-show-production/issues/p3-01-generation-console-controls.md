# Phase 3 Issue 1: Generation Console 控制功能

Status: completed
Opened: 2026-05-13
Completed: 2026-05-13

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 3

## What to build

将 Generation Console 中的暂停、取消、追加约束按钮连接到实际的后端 API，实现完整的 job 控制功能。

## Current state

- Generation Console UI 已经有暂停、取消、追加约束按钮，还支持显示
- Job Registry 已经有完整的状态机（pause, resume, cancel, markNeedsReplan 方法
- 后端 API 已经实现好了（/api/jobs/:id/pause 等）
- 但是前端 api-client.ts 中缺少对应的调用这些 API 的函数
- 回调还没有连接完整的调用和状态管理

## Acceptance criteria

- [ ] 前端 api-client.ts 添加 pauseJob, resumeJob, cancelJob, markNeedsReplan 函数
- [ ] Generation Console 组件的 onPause, onCancel, onAddConstraint 能实际调用 API
- [ ] 从 skin-stage.tsx 和 player-shell.tsx 传递回调链连接完整
- [ ] 当点击按钮时，能正确更新 job 状态
- [ ] 所有相关 typecheck 通过
- [ ] 所有现有测试不失败

## Type

AFK

## Dependencies

- 后端 API 已经存在于 server/src/http/register-routes.ts
- Job Registry 已经存在于 server/src/show/show-generation-job.ts
- UI 组件已经存在于 apps/web/src/features/show/generation-console.tsx

## First slice

最小可验证行为：
1. 在 api-client.ts 中添加控制 job 的 API 函数
2. 连接 Generation Console 的按钮回调
3. 完整连接到实际调用
4. 运行 typecheck 验证

## Audit notes

2026-05-13 审计撤回完成判断：按钮 API 函数和回调链已接入，但 `SkinStage` 给 `GenerationConsole` 传入空函数 fallback，导致没有 active job 或 job 不支持对应动作时仍可能展示可点击但无效果的按钮。还缺真实浏览器点击流验证。后续按 `10-show-production-audit-regressions.md` 统一修复。
