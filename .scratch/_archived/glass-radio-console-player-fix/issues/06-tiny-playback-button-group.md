# 实现极小播放按钮组：上一首、暂停、下一首

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

按钮改成小圆形像素控制，只有 `上一首`、`暂停/播放`、`下一首` 三个核心播放按钮；按钮语义必须真实。

播放按钮只保留：`上一首`、`暂停/播放`、`下一首`、`收藏`、`音量`。不保留 `stop`、`hide`、额外 `fav` 文案按钮，也不保留重复播放按钮。

## Acceptance criteria

- [ ] 三个按钮：上一首 `◀◀`、暂停/播放 `❚❚`/`▶`、下一首 `▶▶`。
- [ ] 按钮为小圆形（或极小圆角方形），像素风格，低对比玻璃背景。
- [ ] 上一首：如果已有播放历史则回退，否则 disabled 或 noop（不报错）。
- [ ] 暂停/播放：真实绑定 audio 播放状态，`idle` 状态时点击触发 episode 启动播放。
- [ ] 下一首：调用 `getNext()` 并自动触发 episode 播放。
- [ ] 所有按钮有 hover、active、disabled 视觉状态。

## Blocked by

- 5（重排 Now Playing 信息层级）

## Comments

