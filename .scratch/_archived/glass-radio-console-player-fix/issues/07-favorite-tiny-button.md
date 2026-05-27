# 实现收藏小按钮

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

收藏只保留一个心形小按钮，状态清晰，不再出现重复或文案型收藏按钮。

## Acceptance criteria

- [ ] 单个心形按钮 `♥`/`♡`，小尺寸，与播放按钮组同风格。
- [ ] 已收藏状态为实心 `♥`，未收藏为空心 `♡`。
- [ ] 点击触发 `addFavorite` / `removeFavorite` API。
- [ ] 收藏状态变化即时反映到按钮视觉。
- [ ] 没有 track 加载时按钮 disabled。
- [ ] 不再有任何文案型收藏按钮（如 `FAV`、`ADD` 等）。

## Blocked by

- 6（实现极小播放按钮组）

## Comments

