# 浏览器画布对比验收 Claudio 对齐

Status: ready-for-agent
Type: HITL

## What to build

用浏览器画布对照用户提供的 Claudio 参考图验收最终视觉。这个 issue 不再新增大功能，重点是截图对比、响应式检查、控制交互和 console 健康。

## Acceptance criteria

- [ ] 在 `http://localhost:3302/` 截取桌面首屏，与参考图逐项对比：品牌栏、时钟区、播放条、Queue 黑条、DJ room、输入栏、footer。
- [ ] 截取移动竖屏视口，确认面板接近全屏且底部输入区可见。
- [ ] 至少验证播放/暂停、下一首、收藏、音量、输入发送中的一个真实交互，并记录状态变化。
- [ ] 浏览器 console 没有未解释的 error；如有 warning，issue comments 中说明原因。
- [ ] 视觉差异清单中不得再出现“继续小修小补”的执行项；剩余问题必须按 Claudio 对齐目标描述。
- [ ] `pnpm --filter @fakeradio/web typecheck` 通过。

## Blocked by

- `.scratch/glass-radio-console-player-fix/issues/18-live-dj-room-and-command-input.md`

## Comments

该 issue 需要人类确认最终视觉是否已经接近参考图，因此标记为 `HITL`。

