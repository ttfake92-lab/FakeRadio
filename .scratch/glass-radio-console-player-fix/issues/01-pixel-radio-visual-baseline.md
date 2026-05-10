# 建立像素电台视觉基线

Status: wontfix
Type: HITL
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

先确认像素字体、小字号、点阵背景、低饱和玻璃面板、边缘呼吸光晕的基准，不直接扩大到所有交互。

标题、时间、状态、按钮文字都走“小号像素体”，不再是现在的大圆润字体。

## Acceptance criteria

- [ ] 全局引入像素字体（如 `Press Start 2P` 或 `VT323`）作为状态、标签、按钮文字的主要字体。
- [ ] 字号体系建立：brand 最大，时间次之，状态/按钮最小，全部使用小字号。
- [ ] 点阵背景或细噪点纹理作为面板底层。
- [ ] 低饱和玻璃面板颜色确认（深黑蓝底 + 弱光晕）。
- [ ] 边缘呼吸光晕动画参数确认（速度、强度、颜色）。
- [ ] `Morning Console` 主题同步适配像素基线。

## Blocked by

None - can start immediately

## Comments

