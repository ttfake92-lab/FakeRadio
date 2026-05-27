# 19 缺失响应压缩与连接超时

Status: needs-triage
Type: performance

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

### 问题 1：无响应压缩

`/api/now`（含队列）和 `/api/episode/next`（含 TTS URL、元数据）返回 JSON 未压缩。局域网内影响小，但在低带宽或移动网络下，白白浪费传输量。

### 问题 2：无连接超时

Fastify 未配置 `connectionTimeout`，LLM 调用等长时间等待可能导致连接挂起。

## How to fix

```typescript
import compress from "@fastify/compress";

await app.register(compress, { encodings: ["gzip", "deflate"] });

const app = Fastify({
  logger: false,
  connectionTimeout: 30_000,
  maxParamLength: 1000
});
```

## Acceptance criteria

- [ ] 安装 `@fastify/compress`（如果未安装）
- [ ] `/api/now` 和 `/api/episode/next` 响应支持 gzip
- [ ] Fastify 配置 `connectionTimeout: 30_000`
- [ ] 不破坏现有功能

## Blocked by

None — can start immediately

## Verification

```bash
curl -I -H "Accept-Encoding: gzip" http://localhost:3000/api/now
# 应返回 Content-Encoding: gzip
```
