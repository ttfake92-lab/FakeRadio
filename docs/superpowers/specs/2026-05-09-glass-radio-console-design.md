# Glass Radio Console Design

## Summary

将 `On Air` 页面从"终端/像素电台"视觉改造为 **Glass Radio Console**：保留 `9:16` 常驻面板和现有播放/DJ 数据流，重做视觉系统为暗色玻璃拟态、柔光卡片、高级控制台质感。实现只改前端展示层，不改 server、adapter、shared contract。

## Design Principles

- 视觉改造，不重新设计 IA，不新增页面
- 保留现有 `OnAirTerminal` 和 `PlayerShell` 数据接口
- 不改主题 ID（`terminal-fm` / `morning-console`），只重定义两个主题的视觉 token
- `Morning Console` 暖色方案基本保留，只改玻璃质感

---

## CSS Glass System Variables

每个主题需要定义以下变量：

### Terminal FM (Glass Radio Console Default Dark)

```css
--glass-bg: #07080d;
--glass-panel: rgba(22, 23, 32, 0.72);
--glass-panel-strong: rgba(10, 12, 20, 0.85);
--glass-border: rgba(255, 255, 255, 0.08);
--glass-highlight: #45d9bd;      /* 青色高光 */
--glass-muted: #777785;
--glass-glow: rgba(69, 217, 189, 0.15);
```

### Morning Console (Warm Variant)

```css
--glass-bg: #e7d0ad;
--glass-panel: rgba(255, 248, 232, 0.62);
--glass-panel-strong: rgba(242, 221, 189, 0.82);
--glass-border: rgba(57, 48, 36, 0.16);
--glass-highlight: #5e9f8a;      /* 柔和薄荷绿 */
--glass-muted: #786d5e;
--glass-glow: rgba(94, 159, 138, 0.12);
```

---

## Zone-by-Zone Visual Treatment

### Stage Background (`on-air-stage`)

- 深黑蓝底 + 紫蓝/青色柔光 radial gradient
- 细噪点叠加（`::before` pseudo-element，opacity ~0.03）
- 不再使用点阵终端背景

### Panel (`on-air-panel`)

- 半透明玻璃卡片：`background: var(--glass-panel)`
- 内发光边框：`border: 1px solid var(--glass-border)`
- `backdrop-filter: blur(12px)`
- 柔和阴影：`box-shadow: 0 8px 40px rgba(0,0,0,0.4)`
- 保留 `9:16` 比例和现有自适应宽度公式

### Topbar (`on-air-topbar`)

- 玻璃背景：`background: var(--glass-panel)`
- `FakeRadio` 品牌字：sans-serif，不再是纯 monospace
- DARK / LIGHT 按钮：small segmented glass toggle，不再是圆角胶囊

### Clock Zone (`on-air-clock`)

- 时间数字：luminous display 风格，柔和光晕（`text-shadow`），不再是像素感
- `on-air-clock-marker`：改为抽象 signal glyph（如 `◴`）或直接隐藏
- 字号比例缩小，不再像 mockup 巨大

### Play Strip (`on-air-play-strip`)

- 玻璃背景卡，不再是纯色硬块
- 播放控件按钮：圆形玻璃低对比按钮，不再是高对比边框圆按钮
- Track meter：保留但降低饱和度，不抢主视觉

### DJ Room (`on-air-dj-room`)

- 整体：高级通知/消息玻璃卡质感
- 消息气泡（`.on-air-message-bubble`）：玻璃材质背景，不是纯黑硬边
- 文字颜色：`var(--on-air-text)`，柔和不过亮

### Input Bar (`on-air-input-bar`)

- 玻璃背景，不是深色硬块
- Textarea：玻璃材质，不是 `#03040a` 纯黑
- Submit 按钮：低对比圆形玻璃，不是 `#d8d7df` 高对比

### Queue Strip / Footer

- 弱化为状态带，不再是独立面板
- 降低视觉权重，让位于主内容区

---

## Typography Direction

- 主导字体：现代 sans-serif（`Inter` / `system-ui`）
- 只在小状态标签（连接状态、Queue 标签）保留 monospace 气质
- 所有字号面向真实手机 UI，不过大

---

## Component Changes (on-air-terminal.tsx)

允许的小调整：
- 调整 className 分组，必要时给时间区/播放带/DJ 卡增加内部 wrapper div
- `DARK/LIGHT` 按钮保持 `aria-pressed` 语义，视觉改为 glass toggle
- `on-air-clock-marker` 可改为抽象 glyph（`◴`）或隐藏

不允许的改动：
- 不改 props 接口
- 不改事件处理逻辑
- 不改主题切换业务逻辑

---

## File Changes

- `apps/web/src/app/globals.css` — 重写玻璃系统变量和所有 `.on-air-*` 区块样式
- `apps/web/src/features/player/on-air-terminal.tsx` — 最小结构调整（className 分组、marker glyph）
- `apps/web/src/features/player/player-shell.tsx` — **不改动**
- `apps/web/src/features/player/player-view-model.ts` — **不改动**

---

## Acceptance Criteria

- 默认页面第一眼：深色、玻璃、柔光、精致卡片，不是终端窗口
- `9:16` 面板是唯一主舞台，不是普通网页卡片网格
- 顶部品牌栏不拥挤，`FakeRadio` 和状态按钮都完整显示
- 时间区醒目但柔和，不像像素终端也不过度巨大
- DJ 区像高级通知/消息玻璃卡，不是黑色代码块
- 播放控件低调存在，不重新变成播放器主视觉
- `Morning Console` 与默认主题结构一致，暖色低刺激质感
- 长 DJ 文案在消息卡内部滚动或自然收纳，不破坏外层比例
- `pnpm --filter @fakeradio/web typecheck` 通过
- `pnpm --filter @fakeradio/web test -- player-view-model.test.ts` 通过
