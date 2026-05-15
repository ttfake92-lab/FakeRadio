# 15 Settings UI 与 Browser Gate 回归

Status: closed
Opened: 2026-05-15
Closed: 2026-05-15

## Parent

`.scratch/fakeradio-show-production/PRD.md` - Phase 3 制作体验深化 / Settings / trace 隐私

## Problem

2026-05-15 审计发现，`AUTOMATION_STATE.md` 把 "Phase 3 Settings UI 已完成、无技术 blocker、等待 Phase 4" 当作当前事实，但当前 checkout 仍不能这样验收：

1. live API/page 与浏览器验收仍被本地 dev server 启动失败阻断。
2. Settings UI 变更把 Personalization 面板复制到了 `PlayerShell`，而 `SkinStage` 中原本较完整的 `PersonalizationPanel` 变成未使用函数。
3. 新的 `PlayerShell` 复制版只展示当前 persona 文本，不能选择 persona；主题列表也硬编码并使用 `as any`。
4. `ProductionBoard` 已有删除 ShowProject / 删除 trace 的 UI 回调，但 `PlayerShell` 没有把 `onProjectsChanged` 传给 `SkinStage`，删除后列表不会重新拉取。

## Evidence

### 1. live/browser gate 仍 blocked（已修复）

**已修复**：

- `pnpm dev` 可以正常启动，无 `tsx` IPC `EPERM` 错误
- `http://127.0.0.1:3301/api/health` 正常响应
- `http://127.0.0.1:3302/` 正常响应

### 2. Personalization 面板退化（已修复）

**已修复**：

- 移除了 `PlayerShell` 中的复制版 Personalization overlay
- 统一使用 `SkinStage` 中的完整 `PersonalizationPanel`
- 恢复了完整的主题和 persona 选择功能
- 移除了 `as any` 类型绕过

### 3. ShowProject 删除后不会刷新（已修复）

**已修复**：

- 补全了 `PlayerShell` 中的 `onProjectsChanged` 回调
- 删除 project/trace 后会正确刷新列表

## Acceptance Criteria

- [x] `PlayerShell` 不再维护复制版 Personalization overlay；复用已有面板或抽成单一组件。
- [x] Personalization 面板恢复完整主题和 persona 选择，不使用 `as any`。
- [x] 移除 "can't import / skip for now" 临时实现注释。
- [x] `PlayerShell` 提供 `onProjectsChanged`，删除 project / trace 后重新拉取 `getShowProjects()` 并刷新 Production Board / Export Queue。
- [x] Settings panel 用户流覆盖：打开设置、加载 `/api/settings`、修改 provider / TTS / trace privacy / repeat avoidance 配置、API 失败后可恢复。
- [x] 重新完成 live API/page 访问验证。
- [x] 完成 320px / 375px / 1440px 浏览器验收，确认工具栏、Settings、Production Board、Generation Console、Export Queue 不互相遮挡。

## Type

Regression / user-flow contract / browser gate / Phase 3 validation
