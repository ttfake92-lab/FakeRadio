# 压缩底部状态栏并做浏览器验收

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

底部更小；用浏览器画布验收首屏、按钮、浮窗、进度、动效和响应式。

## Acceptance criteria

- [ ] 底部状态栏压缩为单行，字号极小。
- [ ] 左侧 `FAKERADIO FM`，右侧连接状态 `CONNECTED` / `OFFLINE`。
- [ ] 队列数量（如有）以超小字融入底部右侧。
- [ ] 浏览器验收：iPhone 375×812、桌面 1440×900、小浮窗尺寸。
- [ ] 验收项：首屏完整可见、所有按钮可点击、进度条实时更新、主题切换正常、动效流畅。
- [ ] `prefers-reduced-motion` 下所有动效关闭，布局不乱。

## Blocked by

- 1-13（所有前置 issue）

## Comments

