# 20 修复 health 端点 webResearch 运算符优先级

Status: needs-triage
Type: bug

## Parent

- 代码审查（2026-05-04）：`FakeRadio/server/src/http/create-server.ts:181`

## What to build

`/api/health` 端点中 webResearch 状态的计算有运算符优先级歧义：

```typescript
// 当前代码（有歧义）
webResearch: options.webResearchAdapter || env.FAKERADIO_BRAVE_API_KEY ? "ready" : "disabled"
```

由于 `||` 优先级高于 `?:`，实际解析为：
```typescript
webResearch: (options.webResearchAdapter || env.FAKERADIO_BRAVE_API_KEY) ? "ready" : "disabled"
```

碰巧结果正确，但若未来将 `||` 改为 `??`，语义会静默改变。需加显式括号消除歧义。

## Acceptance criteria

- [ ] `create-server.ts` 中 webResearch 状态判断加上显式括号
- [ ] 行为不变，测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
