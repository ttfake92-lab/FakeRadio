# 29 DeepSeek adapter compute 和 computeRaw 代码重复

Status: completed
Type: refactor

## Parent

- 代码审查：`FakeRadio/server/src/adapters/llm/deepseek-llm-adapter.ts`

## What to build

`createDeepSeekAdapter` 返回的 `compute` 和 `computeRaw` 方法共享约 80% 的代码（fetch 构造、错误处理、响应解析），只有以下差异：

1. `compute` 使用 `response_format: { type: "json_object" }`，`computeRaw` 不使用
2. `compute` 将响应解析为 JSON 并通过 `DjDecisionSchema.parse` 校验，`computeRaw` 直接返回字符串
3. `compute` 的 system prompt 追加了 JSON schema 指令，`computeRaw` 不追加

建议提取 `callDeepSeek(messages, options?)` 内部函数，处理 fetch 和基础错误处理，`compute` 和 `computeRaw` 各自只处理差异部分。

## Acceptance criteria

- [ ] fetch 构造、超时、错误处理只写一次
- [ ] `compute` 和 `computeRaw` 只包含各自差异逻辑
- [ ] 所有 DeepSeek adapter 测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
