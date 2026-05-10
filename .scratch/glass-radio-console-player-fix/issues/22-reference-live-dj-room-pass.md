# 参考图 DJ 直播间与指令输入精修

Status: ready-for-human
Type: AFK

## Parent

.scratch/glass-radio-console-player-fix/PRD.md

## What to build

把当前过空、内容偏上的 DJ room 调成参考图里的直播间主区域：更大的头像和作者标签、居中的连接状态、更宽的黑色消息卡、更明显的 Replay/Now playing 层级，以及麦克风圆按钮 + 大发送圆按钮。

## Acceptance criteria

- [x] DJ room 使用点阵背景贯穿，和参考图直播区一致。
- [x] 连接状态在 DJ room 中部上方居中显示。
- [x] 消息卡更宽、更醒目，长文案像参考图一样成为核心内容。
- [x] `Replay`、`Now playing` 与消息卡的间距和层级清晰。
- [x] 输入栏右侧是圆形麦克风按钮和更大的圆形发送按钮。
- [x] 底部 `CLAUDIO FM` / `CONNECTED.` 或 `OFFLINE.` 对齐参考图位置。

## Blocked by

- .scratch/glass-radio-console-player-fix/issues/21-reference-console-play-strip-pass.md

## Comments

2026-05-09 已实现：DJ room 增加点阵背景、居中连接状态、大消息卡和参考图式输入按钮；默认页连接状态基于本地 server health 展示为 `CONNECTED.`。
