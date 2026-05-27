# 最终浏览器画布复刻验收

Status: ready-for-human
Type: HITL

## Parent

.scratch/glass-radio-console-player-fix/PRD.md

## What to build

用浏览器画布对比参考图和当前 `http://localhost:3302/`，循环修正直到剩余差异只剩数据内容、时间日期、头像素材等可解释差异。

## Acceptance criteria

- [x] 浏览器桌面截图与参考图在结构上对齐：顶部品牌、时钟、播放条、Queue、DJ room、输入栏、footer。
- [x] 浏览器 console 没有新的 React/Next error overlay 或 hydration mismatch。
- [x] 至少一个交互被验证：主题切换、输入框聚焦、音量或播放按钮。
- [ ] 移动/窄视口没有按钮重叠、文字溢出或输入栏不可见。
- [x] 剩余差异以列表记录，且每项都有“已接受原因”或后续 issue。

## Blocked by

- .scratch/glass-radio-console-player-fix/issues/22-reference-live-dj-room-pass.md

## Comments

2026-05-09 浏览器验证：`http://localhost:3302/` 首屏结构已对齐参考图；输入框聚焦和输入 `好听` 后发送按钮启用。当前未做独立移动视口截图，需最终人工确认。
