# Phase 3 Issue 2: ShowPlan 追加约束功能

Status: completed
Opened: 2026-05-13
Completed: 2026-05-13

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 3

## What to build

用户可在 ShowPlan draft 上追加约束（preferEra、moodHint、avoidExplicit），系统生成新的 ShowPlan 版本并可触发重新规划。

## Current state

- ShowPlan 版本化已有 repository 支持
- Job 支持 needs-replan 状态
- Generation Console 已有追加约束按钮

## Acceptance criteria

- [x] ShowPlanGenerator 支持 generateFromPlan 方法
- [x] /api/plans/add-constraints POST API 创建新版本
- [x] 前端 api-client 添加 addConstraintsToPlan 函数
- [x] 约束输入对话框组件 constraint-dialog.tsx
- [x] Generation Console 集成对话框
- [x] 追加约束后自动触发 needs-replan
- [x] 所有测试通过

## Type

AFK

## Dependencies

- ShowPlanRepository 已有版本化支持
- Job Registry 已有 needs-replan 状态

## Files changed

- server/src/show/show-plan-generator.ts
- server/src/show/show-plan-generator.test.ts
- packages/shared/src/contracts/radio.ts
- server/src/http/register-routes.ts
- server/src/http/create-server.test.ts
- apps/web/src/lib/api-client.ts
- apps/web/src/features/show/constraint-dialog.tsx (新建)
- apps/web/src/features/show/generation-console.tsx
- apps/web/src/features/player/skin-stage.tsx
- apps/web/src/features/player/player-shell.tsx
