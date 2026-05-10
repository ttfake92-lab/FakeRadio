# 添加 On Air 音乐律动效果

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

在时间区或播放区增加低频音乐律动，不影响阅读，支持 reduced motion。

## Acceptance criteria

- [ ] 播放区左侧频谱条（或时间区背景）随音乐播放产生律动。
- [ ] 律动效果基于真实音频状态（`isPlaying`），而非纯 CSS 循环动画。
- [ ] 律动静默时（暂停或未加载）保持静止低亮状态。
- [ ] 支持 `prefers-reduced-motion: reduce` 媒体查询，律动完全关闭。
- [ ] 律动颜色使用主题 accent 色，低透明度，不干扰文字阅读。

## Blocked by

- 3（移除时钟区多余图标并统一时间像素字）

## Comments

