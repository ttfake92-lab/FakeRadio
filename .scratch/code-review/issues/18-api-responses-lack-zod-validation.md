# 18 API 响应缺少 Zod 校验

Status: needs-triage
Type: bug

## Parent

- 代码审查：多个 adapter 的 HTTP 响应解析

## What to build

以下位置对外部 API 响应直接使用 `as` 类型断言，无运行时校验：

| 文件 | 行 |
|------|-----|
| `deepseek-llm-adapter.ts` | ~38 |
| `mimo-tts-adapter.ts` | ~58 |
| `netease-http-music-adapter.ts` | ~54, 69 |

示例（DeepSeek）：
```typescript
const data = (await response.json()) as {
  choices: { message: { content: string } }[];
};
```

如果上游 API 改变响应格式（如 `choices[0].message` 变为 `choices[0].delta`），代码会在运行时崩溃，错误难以追踪。

## How to fix

使用 Zod schema 定义响应格式，`parse()` 替代 `as` 断言：

```typescript
import { z } from "zod";

const DeepSeekResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string()
    })
  }))
});

const data = DeepSeekResponseSchema.parse(await response.json());
```

如果格式不符，Zod 会抛出包含字段路径的明确错误，便于诊断。

## Acceptance criteria

- [ ] `deepseek-llm-adapter.ts` 使用 Zod schema 校验响应
- [ ] `mimo-tts-adapter.ts` 使用 Zod schema 校验响应
- [ ] `netease-http-music-adapter.ts` 的 `CloudSearchResponse` 使用 Zod schema
- [ ] `netease-http-music-adapter.ts` 的 `PlaylistTracksResponse` 使用 Zod schema
- [ ] 格式校验失败时抛出带有 adapter 上下文的错误（不只是 Zod 原生错误）
- [ ] 现有测试继续通过

## Blocked by

None — can start immediately

## Comments

- Zod 已在依赖中（`packages/shared` 使用），无需新增依赖。
- 可以在 `server/src/adapters/` 下建 `schemas.ts` 集中管理各 adapter 的 response schema。
