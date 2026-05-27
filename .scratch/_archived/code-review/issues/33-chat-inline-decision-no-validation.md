# 33 /api/chat intent 分支手动构造 decision 对象未经校验

Status: completed
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/http/register-routes.ts` L218-242

## What to build

`/api/chat` 的多个 intent 分支（add-favorite、export-episode、update-taste、story-background、personal-memory、infer-taste）手动构造 `decision` 对象：

```ts
const decision = {
  say: confirmMsg,
  play: { query: "keep current", reason: "user favorited" },
  reason: "user intent: add-favorite",
  segue: confirmMsg
};
```

这些对象直接传给 `ChatResponseSchema.parse({ message, decision })`，会被 `DjDecisionSchema` 校验。但 `"keep current"` 作为 `query` 虽然通过了 `z.string().min(1)` 的校验，语义上不是一个有效的搜索 query。如果 `DjDecisionSchema` 的 `refine` 逻辑变化，这些硬编码值可能变得不兼容。

建议：

1. 为"保持当前播放"的场景定义一个专用的 decision 构造函数。
2. 或在 `DjDecisionSchema` 中允许 `play.query` 为 `undefined`（当用户意图是保持当前时）。

## Acceptance criteria

- [ ] intent 分支的 decision 构造有统一的 helper 函数
- [ ] 不使用 `"keep current"` 这种语义模糊的 query 值
- [ ] `ChatResponseSchema.parse` 校验仍然通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 这是 issue #26（拆分 register-routes.ts）的子问题，可以在拆分 intent router 时一并处理。
