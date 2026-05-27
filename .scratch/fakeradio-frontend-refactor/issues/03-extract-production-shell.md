# 03 — 解耦 ProductionShell

## 状态：ready

## 目标

从 `skin-stage.tsx` 拆出 ProductionShell，将 production 面板从皮肤层解耦。

## 任务

- [ ] 新建 `apps/web/src/features/show/production-shell.tsx`
- [ ] 从 `skin-stage.tsx` 迁移以下内容到 `production-shell.tsx`：
  - `ProductionToolbar`
  - `ProductionBoard` 渲染
  - `GenerationConsole` 渲染
  - `ExportQueue` 渲染
  - `SettingsPanel` 渲染
  - `ShowLibrary` 渲染
  - `PersonalizationPanel`
- [ ] `production-shell.tsx` 只接收 production 相关 props（briefs、plans、jobs、projects、logs）
- [ ] 更新 `player-shell.tsx`：直接渲染 amber + ProductionShell
- [ ] 删除 `skin-stage.tsx`

## 验证

- `pnpm typecheck` 通过
- `pnpm test` 通过
- 浏览器中 production 面板功能正常
