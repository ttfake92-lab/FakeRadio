# 扩展 DJ 直播间与底部指令输入

Status: ready-for-agent
Type: AFK

## What to build

把当前小 DJ 气泡扩展为参考图里的直播间主内容区：`Claudio`/`LIVE` 状态栏、连接状态、醒目的 DJ 文案黑色卡、Replay 操作、`Now playing` 提示，以及更大的底部“给 DJ 发指令”输入栏。

这一步替代旧 issues 11-13 的紧凑布局和小 popover 方向。

## Acceptance criteria

- [ ] DJ room 顶部显示 `Claudio` 与 `LIVE` 状态，连接状态文案类似 `Connected to Claudio server`。
- [ ] 主 DJ 文案使用高对比黑色消息卡，字号和行高适合长文案阅读。
- [ ] 空状态、server 断开、mock provider 警告都进入 DJ room 的合适层级，不挤占顶部时钟。
- [ ] `Replay` 作为消息下方的明确操作保留，可点击触发现有 replay 行为。
- [ ] `Now playing: title · artist` 显示在 DJ room 下方，视觉权重低于主文案。
- [ ] 底部输入 placeholder 改为 `Say something to the DJ...` 或中文等价文案。
- [ ] 输入区右侧使用麦克风和发送两个明确按钮；更多设置入口不抢占发送主动作。
- [ ] 底部状态栏显示 `CLAUDIO FM` 和连接状态，例如 `CONNECTED.`。

## Blocked by

- `.scratch/glass-radio-console-player-fix/issues/17-console-play-strip-and-queue-bar.md`

