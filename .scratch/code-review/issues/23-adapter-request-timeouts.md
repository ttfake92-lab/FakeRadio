# 23 为 DeepSeek 和 MiMo adapter 添加请求超时

Status: needs-triage
Type: bug

## Parent

- 代码审查（2026-05-04）：`FakeRadio/server/src/adapters/llm/deepseek-llm-adapter.ts:18`、`server/src/adapters/tts/mimo-tts-adapter.ts:37`

## What to build

DeepSeek LLM adapter 和 MiMo TTS adapter 的 `fetch` 调用没有超时控制。若 API 挂起，整个 `/api/next` 或 `/api/episode/next` 请求会无限等待，导致服务端无响应。

Brave Search adapter 已正确使用 `AbortSignal.timeout(5000)` 作为参考。

修复：
- DeepSeek：添加 `AbortSignal.timeout(30_000)`（LLM 推理慢，30 秒合理）
- MiMo TTS：添加 `AbortSignal.timeout(15_000)`（TTS 合成慢于普通 HTTP，15 秒合理）

## Acceptance criteria

- [ ] `deepseek-llm-adapter.ts` fetch 使用 `AbortSignal.timeout(30_000)`
- [ ] `mimo-tts-adapter.ts` fetch 使用 `AbortSignal.timeout(15_000)`
- [ ] 超时时抛出可识别的错误，上层 TTS fallback 能捕获并降级到 mock
- [ ] adapter 测试覆盖超时场景

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
