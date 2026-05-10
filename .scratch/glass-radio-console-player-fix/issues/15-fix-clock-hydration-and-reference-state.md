# 修复时钟 hydration 并建立浏览器参考状态

Status: ready-for-agent
Type: AFK

## What to build

先修复 `OnAirTerminal` 首屏时钟导致的 React hydration mismatch，确保后续视觉对齐基于稳定页面，而不是客户端重建后的偶然状态。

同时建立本轮 Claudio 对齐的浏览器验收基线：本地 web 运行在 `http://localhost:3302/`，server 运行在 `http://127.0.0.1:3301`，参考图目标为“Claudio FM 复古电台终端”。

## Acceptance criteria

- [ ] 首屏加载时浏览器 console 不再出现 `Hydration failed because the server rendered text didn't match the client`。
- [ ] 时钟仍能在客户端每秒或每分钟正常更新。
- [ ] SSR 与客户端首帧时间策略明确：要么首帧稳定占位后客户端接管，要么初始时间只在客户端渲染。
- [ ] 浏览器截图确认页面不是空白、不是 Next.js error overlay。
- [ ] `pnpm --filter @fakeradio/web typecheck` 通过。

## Blocked by

None - can start immediately

## Comments

2026-05-09 浏览器对比时观察到：`on-air-time` 服务端渲染 `21:36`，客户端首帧为 `21:37`，触发 hydration mismatch。这个问题会干扰视觉 QA，必须先处理。

