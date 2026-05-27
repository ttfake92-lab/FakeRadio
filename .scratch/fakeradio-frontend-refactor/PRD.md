# FakeRadio 前端重构：单一 Amber 主题 + 桌面优先布局

## 问题

当前 web 端存在架构债务：

1. **PlayerShell 是 god component**（634 行）：管理所有状态（播放、音频、聊天、收藏、production、主题、persona、头像）和所有业务逻辑
2. **SkinStage 混合职责**（628 行）：既是皮肤路由（5 个皮肤组件），又是 production 面板容器（6 个面板组件）
3. **5 套独立皮肤**（每套 500+ 行）：重复实现相同的 UI 逻辑，`useRadioBridge` 适配层增加不必要的复杂度
4. **主题切换逻辑**：7 个主题 ID、两条渲染路径（新皮肤 vs 旧 OnAirTerminal），接口混乱

## 目标

- 收窄为 **amber**（暖橙胶片）作为唯一皮肤
- **桌面端优先**布局
- Production 面板（制作台/生成控制台/导出队列/设置/节目库）从皮肤层解耦
- PlayerShell 拆分为可维护的 hooks + 组件

## 非目标

- 不改变 server 端逻辑
- 不改变 shared contract
- 不改变 production 功能本身（只重构布局和接入方式）
- 不新增皮肤

## 设计约束

- 保留 `useRadioBridge`（它本身是合理的状态适配层）
- 保留 `features/show/` 下所有 production 组件（ProductionBoard、GenerationConsole 等）
- amber 皮肤组件保持独立（`skin-amber.tsx`），方便未来重新引入多皮肤
- 桌面端为主视图，移动端作为 secondary 响应式适配

## 里程碑

| # | 名称 | 内容 | 验证 |
|---|------|------|------|
| 1 | 备份 + 删除废弃皮肤 | git tag 备份；删除 4 个废弃皮肤 + 旧 OnAirTerminal | typecheck 通过 |
| 2 | 简化配置和视图模型 | 简化 skin-config.ts（删除 SkinId/SKINS）和 player-view-model.ts（单主题） | typecheck + test 通过 |
| 3 | 解耦 ProductionShell | 从 SkinStage 拆出 ProductionShell；删除 SkinStage | typecheck + test 通过 |
| 4 | 拆分 PlayerShell hooks | 提取 use-production-state、use-player-controls、use-player-prefs | typecheck + test 通过 |
| 5 | 简化 PlayerShell 渲染 | 移除主题路由，直接渲染 amber + ProductionShell | 浏览器冒烟通过 |
| 6 | 桌面优先布局 | 实现桌面端主视图布局（中央播放器 + 侧面板） | 多视口验证 |
