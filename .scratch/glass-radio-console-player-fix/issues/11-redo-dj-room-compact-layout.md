# 重做 DJ 对话区紧凑布局

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

消息气泡缩小，去掉多余 FakeRadio，Replay 不再单独占一块难看的位置。

## Acceptance criteria

- [ ] DJ Room 整体高度压缩，不再用 `grid-template-rows: 14% auto minmax(0, 1fr)` 这种固定百分比。
- [ ] 删除 DJ Room header 中独立的 `LIVE` 标签和 server-line。
- [ ] DJ 名字和消息气泡紧凑排列，头像缩小。
- [ ] `Replay` 按钮不再单独占一行，而是整合到消息元信息行（小图标按钮）。
- [ ] 消息气泡使用像素字体，更小字号，玻璃背景。
- [ ] 消息区支持纵向滚动，内容超出时不截断。

## Blocked by

- 10（移除 Queue / Tracks / Live 文案噪音）

## Comments

