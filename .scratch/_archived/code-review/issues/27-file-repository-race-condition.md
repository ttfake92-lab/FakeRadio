# 27 favorites 和 session 文件仓库的并发读写竞态

Status: completed
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/user/favorites-repository.ts`、`FakeRadio/server/src/user/session-repository.ts`

## What to build

两个文件仓库都使用 read-modify-write 模式，没有文件锁：

**favorites-repository.ts**：
```ts
async save(track) {
  const favorites = await readAll();       // read
  favorites.push(entry);
  await writeAll(favorites);               // write
}
```

**session-repository.ts**：
```ts
async appendMessage(entry) {
  const entries = await readSession(date); // read
  entries.push(entry);
  await writeSession(date, entries);       // write
}
```

当并发请求（如 `/api/next` 广播同时触发 chat 消息记录）同时执行时：
1. 两个请求都读到相同的文件内容
2. 各自修改自己的副本
3. 后写入的覆盖先写入的，丢失中间条目

建议：

1. 在文件仓库层引入进程内 mutex（如简单的 `Promise` 链式锁）。
2. 或改用 SQLite（单文件数据库，自带并发控制）。
3. 最简方案：用一个 `let writeLock: Promise<void> = Promise.resolve()` 做串行化。

## Acceptance criteria

- [ ] `favorites-repository` 的 `save` 和 `remove` 串行化
- [ ] `session-repository` 的 `appendMessage` 串行化
- [ ] 并发写入不丢失数据
- [ ] 新增并发写入测试

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 本地单用户场景下并发概率不高，但 chat intent handler 中 favorites 和 session 写入可能在 `/api/next` 的 memory.append 同时发生。
- 最简方案用 `let lock = Promise.resolve(); lock = lock.then(fn);` 即可，无需引入额外依赖。
