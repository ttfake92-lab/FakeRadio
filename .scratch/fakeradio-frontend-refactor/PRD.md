# FakeRadio 前端重构：Late-Night Studio 设计

## 状态：已完成初始实现 (2026-05-27)

## 问题

原前端存在架构债务：

1. **PlayerShell 是 god component**（634 行）：管理所有状态
2. **SkinStage 混合职责**（628 行）：皮肤路由 + production 面板容器
3. **5 套独立皮肤**：重复实现相同 UI 逻辑
4. **主题切换混乱**：7 个主题 ID、两条渲染路径

## 方案

采用 `design_handoff_late_night_studio/` 的 Late-Night Studio 设计，完全替换原有前端。

### 设计核心

- 单页 companion page，桌面端 1200px 设计宽度
- 四个区域：StudioBar → StudioHero → StudioConsole（3列） → StudioTapeDeck
- 深棕黑底 + amber 呼吸光晕 + serif/mono 排版
- 电台感 + 对话感 + 陪伴感

### 实现架构

```
apps/web/src/features/studio/
├── shared.tsx         # useTypewriter, TypingLine, WaveBars, BreathingHalo, LiveDot
└── studio-page.tsx    # StudioPage + 所有子组件
```

- `page.tsx` 直接渲染 `<StudioPage />`
- 数据通过 `/api/now` 轮询 + `/api/events` SSE 获取
- 聊天通过 `/api/chat` 发送，走 chat-intent-router

## 已完成

- [x] 备份 git tag: `backup/pre-late-night-studio`
- [x] 更新 Google Fonts（Newsreader, Source Serif 4, Manrope, DM Sans, JetBrains Mono）
- [x] 替换 globals.css 为 Late-Night Studio 设计 tokens + keyframes
- [x] 创建 shared.tsx（5 个共享组件/hooks）
- [x] 创建 studio-page.tsx（全部组件 + 实时数据接入）
- [x] 更新 page.tsx 使用 StudioPage
- [x] TypeScript 编译通过
- [x] Next.js build 通过

## 待优化

- [ ] 老代码清理（player-shell.tsx, skin-stage.tsx, skin-*.tsx 等可删除）
- [ ] settings/profile 页面需适配新设计
- [ ] 移动端响应式（<960px, 当前仅桌面端）
- [ ] AnalyserNode 驱动波形（可选，v1.1）
- [ ] Production 面板集成（当前在 studio-page.tsx 外部，需决定是否内嵌）

## 设计规范

详见 `design_handoff_late_night_studio/README.md`（500 行完整规范）。
