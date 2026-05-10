# 28 /cache/tts/* 路由仍使用同步 existsSync

Status: completed
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/http/register-routes.ts` L475

## What to build

Issue #03 已将 `tts-cache-manager.ts` 改为异步 I/O。但 `/cache/tts/*` 路由处理器中仍然使用同步的 `existsSync` 检查文件存在性：

```ts
// register-routes.ts L475
if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(filePath)) {
  return reply.status(404).send("Not found");
}
```

`existsSync` 在 Fastify 异步服务器中会阻塞事件循环。应改用 `fs/promises.access` 或 `fs/promises.stat`。

建议：

```ts
import { access } from "node:fs/promises";

// 替换 existsSync
const fileExists = await access(filePath).then(() => true, () => false);
if (relativePath.startsWith("..") || isAbsolute(relativePath) || !fileExists) {
  return reply.status(404).send("Not found");
}
```

## Acceptance criteria

- [ ] `/cache/tts/*` 路由不再使用 `existsSync`
- [ ] 改用 `fs/promises.access` 或 `fs/promises.stat`
- [ ] 路径逃逸检查逻辑不变
- [ ] 现有测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
grep -r "existsSync" server/src/http/register-routes.ts  # 应无结果
```
