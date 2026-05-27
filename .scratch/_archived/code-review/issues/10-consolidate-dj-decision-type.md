# 10 统一 DjDecision 类型与 Zod Schema

Status: ready-for-agent
Type: refactor

## Parent

- 代码审查：`FakeRadio/packages/shared/src/contracts/radio.ts`

## What to build

手动定义的 `DjDecision` 类型中 `play.query` 和 `play.trackId` 都是 `optional`，但 `DjDecisionBaseSchema` 的 `.refine()` 要求至少有一个存在。`transform` 之后的输出类型没有正确反映这个约束 — 运行时满足 `query | trackId` 至少一个有值，但 TypeScript 类型允许两者都为 `undefined`。

当前手动类型：

```ts
export type DjDecision = {
  say: string;
  play: { query?: string; trackId?: string; reason: string; };
  reason: string;
  segue: string;
};
```

建议：

1. 移除手动定义的 `DjDecision` 类型。
2. 使用 `z.infer<typeof DjDecisionSchema>` 作为唯一类型来源。
3. 如果需要更精确的类型（至少一个 of query/trackId），使用 `z.union` 或 `z.discriminatedUnion`。

## Acceptance criteria

- [ ] `DjDecision` 类型只从 `DjDecisionSchema` 推导，不再手动定义
- [ ] 类型系统正确反映 `query | trackId` 至少一个有值的约束
- [ ] 所有引用 `DjDecision` 的代码继续编译通过
- [ ] 所有 DJ brain 测试继续通过（2 个测试）

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run typecheck
pnpm run test
```

## Comments

- 当前 `DjDecisionSchema` 使用 `.transform()` 返回新对象，`z.infer` 会得到 transform 后的类型。需要确认 transform 后的类型是否满足约束。
