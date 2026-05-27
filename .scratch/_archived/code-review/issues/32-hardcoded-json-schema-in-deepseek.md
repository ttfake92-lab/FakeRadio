# 32 DeepSeek adapter 硬编码 JSON schema 指令

Status: completed
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/adapters/llm/deepseek-llm-adapter.ts`

## What to build

`fragmentsToMessages` 函数在 `compute` 模式下向 system prompt 追加了一段硬编码的 JSON schema 指令：

```ts
const jsonSchemaSuffix = `
You must respond with valid JSON matching this exact schema:
{
  "say": "string - ...",
  "play": { "query": "string - ...", "reason": "string - ..." },
  "reason": "string - ...",
  "segue": "string - ..."
}
The "play" object must have either "query" or "trackId", plus "reason".`;
```

这段字符串与 `packages/shared/src/contracts/radio.ts` 中的 `DjDecisionSchema` 定义是手动同步的。如果 schema 添加了新字段（如 `segue` 的约束变化），这里不会自动更新，导致 LLM 输出与实际校验不一致。

建议：

1. 从 `DjDecisionSchema` 自动推导 JSON schema 描述。
2. 或至少将 `jsonSchemaSuffix` 提取为常量并添加注释标记与 `DjDecisionSchema` 的对应关系。
3. 最佳方案：使用 DeepSeek 的 `response_format: { type: "json_schema", json_schema: {...} }` 特性，从 Zod schema 生成 JSON Schema。

## Acceptance criteria

- [ ] JSON schema 指令与 `DjDecisionSchema` 保持同步
- [ ] 不使用手动复制粘贴的 schema 字符串
- [ ] 所有 DeepSeek adapter 测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- `zod-to-json-schema` 包可以从 Zod schema 自动生成 JSON Schema，但引入新依赖需评估。
- 短期方案：将 schema 指令提取为命名常量，在 `DjDecisionSchema` 变更时有注释提醒同步。
