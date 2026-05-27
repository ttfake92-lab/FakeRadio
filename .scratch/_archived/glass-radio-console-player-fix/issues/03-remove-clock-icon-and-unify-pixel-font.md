# 移除时钟区多余图标并统一时间像素字

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

删除左侧时钟图标，时间、星期、日期、ON AIR 全部使用像素字体和更低透明度。

## Acceptance criteria

- [ ] 删除时钟区左侧的 `◴` 图标。
- [ ] 时间 `HH:MM` 使用像素字体，醒目但不过大。
- [ ] 星期、日期使用更小像素字体，低透明度。
- [ ] `ON AIR` 状态使用像素字体，保留呼吸动画但更低饱和度。
- [ ] `modeLabel`（Morning / Focus / Afternoon / Night）使用像素字体，与 ON AIR 同行或紧邻。
- [ ] 时钟区整体高度压缩，给下方播放区留出空间。

## Blocked by

- 1（建立像素电台视觉基线）

## Comments

