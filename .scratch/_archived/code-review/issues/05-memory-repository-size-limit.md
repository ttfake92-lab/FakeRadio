# 05 内存仓库增加大小限制

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/state/memory-repository.ts`

## What to build

`createInMemoryMemoryRepository` 的 `entries` 数组会无限增长。长时间运行后，内存不会释放。虽然 `recent(limit)` 只切尾部不会返回过多数据，但底层数组持续膨胀。

建议：

1. 增加可配置的最大条目数（默认 100）。
2. 当条目数超过上限时，淘汰最旧的条目。
3. `recent(limit)` 返回最新的 `limit` 条目（当前已经是这样）。

## Acceptance criteria

- [ ] `createInMemoryMemoryRepository` 接受可选 `maxEntries` 参数，默认 100
- [ ] `append` 在超过上限时淘汰最旧条目
- [ ] 淘汰后 `recent(limit)` 仍返回正确结果
- [ ] 新增测试覆盖上限溢出和淘汰行为

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 当前 `recent(limit)` 使用 `entries.slice(-limit)`，淘汰最旧条目后这个逻辑仍然正确。
