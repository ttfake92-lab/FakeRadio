# 06 — 桌面优先布局

## 状态：ready

## 目标

实现桌面端优先的响应式布局。

## 任务

- [ ] 新建 `apps/web/src/features/player/desktop-layout.tsx`（或在 PlayerShell 中直接实现）
- [ ] 桌面端：左侧/中央 amber 播放器主视图 + 右侧 production 面板区域（可折叠）
- [ ] 移动端：堆叠为单列（降级布局）
- [ ] 响应式断点：`min-width: 1024px` 为桌面端分界
- [ ] Production 面板区域支持展开/收起

## 验证

- `pnpm typecheck` 通过
- 桌面端（1440px）：播放器和面板并排显示
- 平板端（768px）：可正常使用
- 手机端（375px）：单列堆叠，功能完整
