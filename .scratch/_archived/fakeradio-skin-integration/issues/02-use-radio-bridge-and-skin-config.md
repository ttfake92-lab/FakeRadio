Status: completed

## Parent

- `.scratch/fakeradio-skin-integration/PRD.md`

## What to build

新增 `useRadioBridge` hook 和 `skin-config.ts`。

新增文件：
- `apps/web/src/features/player/use-radio-bridge.ts` — 桥接 hook，构造兼容皮肤的 RadioState
- `apps/web/src/features/player/skin-config.ts` — PERSONAS（4 套 DJ）、SKINS（5 套皮肤）、QUICK_PROMPTS、fmt

新增测试：
- `apps/web/src/features/player/use-radio-bridge.test.ts`
