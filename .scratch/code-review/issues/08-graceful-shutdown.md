# 08 增加优雅关停处理

Status: ready-for-agent
Type: feature

## Parent

- 代码审查：`FakeRadio/server/src/index.ts`

## What to build

`server/src/index.ts` 启动后没有注册 `SIGTERM` / `SIGINT` 处理。Fastify 实例没有 `close()` 调用。长时间运行的服务应该在收到终止信号时清理资源（关闭 WebSocket 连接、等待进行中的请求完成、关闭 TTS 缓存文件句柄等）。

建议：

```ts
const app = await createRadioServer();

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ ... });
```

## Acceptance criteria

- [ ] `SIGTERM` 信号触发 `app.close()`
- [ ] `SIGINT` 信号触发 `app.close()`
- [ ] 关闭过程中 WebSocket 连接被正确断开
- [ ] 关闭过程不阻塞超过 5 秒（超时后强制退出）

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run dev
# 在另一个终端发送 SIGTERM，观察日志输出
kill -TERM <pid>
```

## Comments

- Fastify 的 `close()` 会自动处理 HTTP 连接的优雅关闭。
- WebSocket 连接需要在 `stream-bus` 中注册 close 回调。
