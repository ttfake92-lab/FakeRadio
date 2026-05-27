# 重排 Now Playing 信息层级

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

歌曲名、artist、播放状态、异常状态、进度条形成清晰层级，避免现在的横向挤压。

播放区做成一条紧凑控制台：左侧律动 + 歌曲，右侧小按钮 + 音量，下方完整进度。

## Acceptance criteria

- [ ] 歌曲名独占一行，像素字体，可横向滚动（长歌名）。
- [ ] Artist 名在歌曲名下方，更小字号，低透明度。
- [ ] 播放状态（待机/播放中/口播中/异常）以标签形式展示，不与歌曲名挤在同一行。
- [ ] Mock 回退警告或异常状态以独立小标签展示，不破坏整体层级。
- [ ] 进度条完整宽度在歌曲信息下方，不被按钮挤压。

## Blocked by

- 1（建立像素电台视觉基线）

## Comments

