# 01 — 备份 + 删除废弃皮肤

## 状态：ready

## 目标

创建 git tag 备份当前状态，删除 4 个废弃皮肤组件和旧 OnAirTerminal。

## 任务

- [ ] `git tag -a backup/pre-single-skin -m "Backup before single-skin refactor"`
- [ ] 删除 `apps/web/src/features/player/skin-pixel.tsx`
- [ ] 删除 `apps/web/src/features/player/skin-terminal.tsx`
- [ ] 删除 `apps/web/src/features/player/skin-bento.tsx`
- [ ] 删除 `apps/web/src/features/player/skin-y2k.tsx`
- [ ] 删除 `apps/web/src/features/player/on-air-terminal.tsx`
- [ ] 更新 `player-shell.tsx` 中的 import（移除已删除组件的导入）
- [ ] 更新 `skin-stage.tsx` 中的 import（移除已删除组件的导入）

## 验证

- `pnpm typecheck` 通过（会有大量类型错误，后续 issue 修复）
- 目标：确认删除的文件不再被引用
