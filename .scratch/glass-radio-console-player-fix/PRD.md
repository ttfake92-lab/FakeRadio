# Claudio On Air 播放器对齐 PRD

## 背景

之前 `.scratch/glass-radio-console-player-fix/issues/01-14` 把前端问题拆成了许多小修小补：字号、按钮、进度条、footer、popover 等局部调整。浏览器画布对比参考图后，结论是当前页面偏离不是某个控件的问题，而是整体信息架构和视觉密度不对。

参考目标不是“玻璃拟态播放器”，而是 **Claudio FM 复古电台终端**：

- 顶部是头像 + 大号点阵 `Claudio` 品牌。
- 大号时间区是第一视觉重心。
- 播放控制区是一条完整横向控制台。
- `QUEUE / 0 TRACKS` 黑色分隔栏必须常驻。
- DJ 直播间是主要内容区，不是小聊天气泡。
- 底部输入区是“给 DJ 发指令”，不是普通聊天框。

因此旧的 01-14 已标记为 `wontfix`，本 PRD 与 issues 15-19 替代旧执行方向。

## 目标

让 `http://localhost:3302/` 的默认 `On Air` 页面在桌面和移动端第一眼接近参考图里的 Claudio 播放器，而不是继续在现有窄聊天面板上局部打补丁。

## 非目标

- 不复刻参考图里的抖音水印、外部字幕、录屏鼠标指针。
- 不新增外部 provider。
- 不改变本地 server、adapter 或 shared contract。
- 不把网易云登录、Signals、Memory、Setup 塞回默认页。

## 可执行切片

1. `15-fix-clock-hydration-and-reference-state.md`
2. `16-claudio-shell-brand-and-clock.md`
3. `17-console-play-strip-and-queue-bar.md`
4. `18-live-dj-room-and-command-input.md`
5. `19-browser-canvas-acceptance.md`

## 验收基线

- 浏览器首屏不出现 React/Next hydration mismatch。
- 桌面截图中，面板宽度、顶部品牌、时间区、播放条、队列黑条、DJ room、输入区的层级与参考图一致。
- 移动竖屏中，核心面板接近全屏，输入区和底部状态栏始终可见。
- 控制按钮和输入框可交互。
- `pnpm --filter @fakeradio/web typecheck` 通过。
- 若改到 view-model 或 API client，相关测试通过。

