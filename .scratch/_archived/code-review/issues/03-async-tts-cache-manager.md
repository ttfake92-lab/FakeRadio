# 03 TTS cache manager 改用异步 I/O

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/adapters/tts/tts-cache-manager.ts`

## What to build

`tts-cache-manager.ts` 当前使用 `existsSync`、`writeFileSync` 和 `mkdirSync`，这些同步操作会阻塞 Node.js 事件循环。在 Fastify 异步服务器中，当多个请求同时到达时，同步文件 I/O 会成为性能瓶颈。

需要将 `TtsCacheManager` 接口改为异步：

```ts
export type TtsCacheManager = {
  resolvePath(cacheKey: string): string;
  exists(cacheKey: string): Promise<boolean>;
  save(cacheKey: string, buffer: Buffer): Promise<void>;
};
```

使用 `fs/promises` 的 `access`（替代 `existsSync`）、`writeFile`（替代 `writeFileSync`）和 `mkdir`（替代 `mkdirSync`）。

## Acceptance criteria

- [ ] `exists` 方法改用 `fs/promises.access`
- [ ] `save` 方法改用 `fs/promises.writeFile` 和 `fs/promises.mkdir`
- [ ] `TtsCacheManager` 接口方法签名改为 `Promise` 返回
- [ ] `edge-tts-adapter.ts` 和 `mock-tts-adapter.ts` 适配新的异步接口
- [ ] 所有 TTS 相关测试继续通过（edge-tts-adapter: 3, mock-tts-adapter: 7, tts-cache-manager: 5）
- [ ] 新增并发写入测试

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
pnpm run typecheck
```

## Comments

- `resolvePath` 保持同步即可，它只是路径计算。
- 注意 `edge-tts-adapter.ts` 中 `cacheManager.exists` 和 `cacheManager.save` 的调用需要改为 `await`。
