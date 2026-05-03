# 17 外部 HTTP 调用无重试逻辑

Status: needs-triage
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/adapters/`（多个 adapter）

## What to build

以下 adapter 的外部 HTTP 调用没有重试机制：

- `deepseek-llm-adapter.ts` — LLM API
- `mimo-tts-adapter.ts` — TTS API
- `public-metadata-adapter.ts` — MusicBrainz API

外部 API（LLM、TTS、元数据）在网络瞬断、限流或服务端抖动时可能偶发失败，当前实现立即向上抛出，没有重试。

## How to fix

在 `server/src/adapters/` 中实现统一的 `withRetry` 工具函数：

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError!;
}
```

然后在各 adapter 的 HTTP 调用外层包裹：

```typescript
const response = await withRetry(() =>
  fetchJson(`${baseUrl}/v1/chat/completions`, { ... }), 2, 500
);
```

## Acceptance criteria

- [ ] 实现 `withRetry` 工具函数
- [ ] DeepSeek adapter 的 `fetch` 调用包裹 `withRetry`
- [ ] MiMo adapter 的 `fetch` 调用包裹 `withRetry`
- [ ] MusicBrainz adapter 的 `fetch` 调用包裹 `withRetry`
- [ ] 4xx 错误不重试（客户端问题重试无意义）
- [ ] 现有测试继续通过

## Blocked by

None — can start immediately

## Comments

- 重试次数不宜过多（最多 2-3 次），避免对限流 API 造成更大压力。
- 429（rate limit）可以考虑更长延迟，但当前各 API 未返回 Retry-After 头，暂时统一退避即可。
