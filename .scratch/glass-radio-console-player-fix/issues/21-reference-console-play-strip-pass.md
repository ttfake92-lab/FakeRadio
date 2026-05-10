# 参考图播放控制台精修

Status: ready-for-human
Type: AFK

## Parent

.scratch/glass-radio-console-player-fix/PRD.md

## What to build

把播放条从当前小控件行调成参考图里的完整控制台：左侧频谱更明显，歌曲信息更靠左，中间按钮更圆、更大，右侧音量滑杆更长，进度条和时间信息更像真实播放器。

## Acceptance criteria

- [x] 播放条高度和内部留白接近参考图，不再显得被压扁。
- [x] 播放按钮是圆形控制按钮，视觉中心明确。
- [x] 音量滑杆长度明显增加，位于播放条右侧。
- [x] 进度条横向跨度足够长，当前时间和总时长分布接近参考图。
- [x] 长歌名和 artist 不撑破播放条。

## Blocked by

- .scratch/glass-radio-console-player-fix/issues/20-reference-proportion-and-led-clock-pass.md

## Comments

2026-05-09 已实现：播放条改为三列 grid，避免 `VOL` 被挤到下一行；按钮、音量和进度条按参考图控制台重新排布。
