# 16 CORS 允许任意 localhost 端口

Status: ready-for-agent
Type: security

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

当前 CORS 配置：

```typescript
await app.register(cors, {
  origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
});
```

任意 localhost 端口都允许访问。在共享开发环境或本地网络被入侵时，恶意页面（`http://localhost:9999`）可以调用 FakeRadio API。

## How to fix

限定到已知端口：

```typescript
await app.register(cors, {
  origin: [
    "http://localhost:3000",  // Next.js default
    "http://localhost:3001",  // Alternative dev port
    "http://localhost:3002",  // Another possible port
  ]
});
```

或通过环境变量配置允许列表：

```typescript
const allowedOrigins = (process.env.FAKERADIO_ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map(s => s.trim());

await app.register(cors, { origin: allowedOrigins });
```

## Acceptance criteria

- [ ] CORS  origin 限定到显式端口列表
- [ ] 可通过环境变量配置允许的 origin 列表
- [ ] 现有开发流程（localhost:3000）不受影响

## Blocked by

None — can start immediately

## Verification

从 `http://localhost:9999` 发送跨域请求，验证被拒绝（响应无 CORS 头）。
