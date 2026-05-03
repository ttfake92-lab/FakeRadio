# 14 Stream Bus broadcast 竞态条件

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/realtime/stream-bus.ts`

## What to build

`broadcast()` 方法在遍历 `clients` Set 时直接调用 `clients.delete(client)`，导致并发修改：

```typescript
broadcast(event: StreamEvent) {
  const message = JSON.stringify(StreamEventSchema.parse(event));
  for (const client of clients) {      // 遍历中
    try {
      client.send(message);
    } catch {
      clients.delete(client);          // ❌ 修改中删除
    }
  }
}
```

这可能导致：`TypeError`（Set 迭代器失效）或部分 client 被跳过。

`add()` 返回的 cleanup 函数正确使用 `clients.delete()`，但 broadcast 内部没复用该模式。

## How to fix

收集死 client 后统一删除：

```typescript
broadcast(event: StreamEvent) {
  const message = JSON.stringify(StreamEventSchema.parse(event));
  const deadClients: StreamClient[] = [];
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      deadClients.push(client);
    }
  }
  for (const dead of deadClients) {
    clients.delete(dead);
  }
}
```

## Acceptance criteria

- [ ] `broadcast()` 不在遍历中修改 `clients`
- [ ] 死 client 在遍历结束后统一删除
- [ ] 现有测试继续通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
