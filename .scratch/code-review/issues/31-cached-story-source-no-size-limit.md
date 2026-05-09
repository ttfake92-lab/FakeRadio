# 31 cached-web-research-adapter 缓存无大小限制

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/adapters/story-source/cached-web-research-adapter.ts`

## What to build

`createCachedStorySourceAdapter` 使用 `Map<string, CacheEntry>` 做 TTL 缓存，但没有大小限制。长时间运行后 Map 持续增长。

与 issue #05（memory repository 增加大小限制）类似，需要增加最大条目数限制。

建议：

1. 增加 `maxEntries` 参数（默认 200）。
2. 当超过上限时，淘汰最早过期或最早写入的条目。
3. 在 `gather` 中先清理过期条目，再检查大小。

## Acceptance criteria

- [ ] 缓存有最大条目数限制（默认 200）
- [ ] 超过上限时淘汰最旧条目
- [ ] 过期条目在访问时被清理
- [ ] 新增测试覆盖缓存溢出

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 当前缓存条目内容是 `StorySourceNote[]`（通常 1-3 条），内存占用不大，但长时间运行仍应控制上限。
