# 04 — 拆分 PlayerShell hooks

## 状态：ready

## 目标

将 PlayerShell 的状态管理拆分为独立 hooks。

## 任务

- [ ] 新建 `apps/web/src/features/player/use-production-state.ts`：
  - `productionBriefs`、`activeBriefId`、`productionPlans`、`productionJobs`、`productionProjects`、`generationLogs`
  - `loadDashboard`、`handleSwitchBrief`、`handlePauseJob`、`handleResumeJob`、`handleCancelJob`、`handleAddConstraint`、`handleProjectsChanged`
- [ ] 新建 `apps/web/src/features/player/use-player-controls.ts`：
  - `handleNext`、`handlePlayPause`、`handleReplay`、`handleVolumeChange`、`handleSeek`
  - `handleToggleFavorite`、`submitChatMessage`
- [ ] 新建 `apps/web/src/features/player/use-player-prefs.ts`：
  - `theme`（简化为固定 amber）、`selectedPersona`、`avatarSrc`、`volume`
  - localStorage 读写

## 验证

- `pnpm typecheck` 通过
- `pnpm test` 通过
