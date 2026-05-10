# 修复播放进度实时显示

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

进度条、当前时间、总时长来自真实播放状态；异常/未加载时显示明确 fallback。

## Acceptance criteria

- [ ] 进度条宽度 `width: (currentTime / duration) * 100%`，实时更新。
- [ ] 当前时间标签 `MM:SS` 来自 `audio.currentTime`。
- [ ] 总时长标签来自 `track.durationMs`（或 `audio.duration`）。
- [ ] 未加载或 `duration` 未知时显示 `--:--` 或 `0:00`。
- [ ] 进度条支持点击跳转（可选，本 issue 可不做）。
- [ ] 移除所有硬编码的进度值（如现有的 `width: 17%`）。

## Blocked by

- 6（实现极小播放按钮组）

## Comments

