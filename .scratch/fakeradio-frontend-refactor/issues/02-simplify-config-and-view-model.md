# 02 — 简化配置和视图模型

## 状态：ready

## 目标

简化 `skin-config.ts` 和 `player-view-model.ts`，移除多主题支持。

## 任务

- [ ] `skin-config.ts`：删除 `SkinId` 类型、`SKINS` 常量
- [ ] `player-view-model.ts`：`ON_AIR_THEMES` 简化为 `["amber"]`，`OnAirThemeId` 简化
- [ ] `player-view-model.ts`：简化 `getThemeLabel`
- [ ] `player-shell.tsx`：移除 `isNewSkin()` 函数和旧皮肤渲染路径
- [ ] `player-shell.tsx`：移除 `terminal-fm`/`morning-console` 相关逻辑

## 验证

- `pnpm typecheck` 通过
- `pnpm test` 通过
