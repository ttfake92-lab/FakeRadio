# 实现音量小控制

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

播放区右侧增加 `VOL` 小标签和迷你滑杆，绑定本地 audio 音量状态。

## Acceptance criteria

- [ ] `VOL` 小标签（像素字体）在播放区右侧或按钮组旁。
- [ ] 迷你音量滑杆（或 +/- 按钮）控制 `audio.musicRef.volume`。
- [ ] 滑杆最小化设计，不占用过多横向空间。
- [ ] 音量状态持久化到 `localStorage`（可选）。
- [ ] 静音/恢复功能（点击 `VOL` 标签切换）。

## Blocked by

- 6（实现极小播放按钮组）

## Comments

