# 11 统一 adapter 错误处理策略

Status: ready-for-agent
Type: refactor

## Parent

- 代码审查：`FakeRadio/server/src/adapters/`

## What to build

各 adapter 的错误处理风格不一致：

- `web-research-adapter`：`catch { return [] }` — 静默吞掉错误
- `public-metadata-adapter`：`catch { return [] }` — 同上
- `netease-lyric-adapter`：没有 `try/catch` — 会向上抛出
- `create-server.ts` 中 episode 路由：每个 adapter 调用单独 `try/catch`

建议：

1. adapter 层统一在 `catch` 中至少记录 `console.warn`，包含 adapter 名称和错误摘要。
2. 对于"资料收集"类 adapter（story source），统一返回空数组表示"无数据"。
3. 对于"核心能力"类 adapter（music、tts），允许向上抛出，由调用方决定 fallback 策略。

## Acceptance criteria

- [ ] `web-research-adapter` 和 `public-metadata-adapter` 在 `catch` 中记录 `console.warn`
- [ ] `netease-lyric-adapter` 增加 `try/catch`，失败时返回空数组并记录警告
- [ ] adapter 类型注释中说明错误处理约定
- [ ] 所有 adapter 测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- `console.warn` 而非 `console.error`，因为这些 adapter 的失败是预期的降级路径。
- 可以在 `types.ts` 中为 `StorySourceAdapter` 增加 JSDoc 注释说明错误处理约定。
