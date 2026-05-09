# 34 State DB 启动恢复污染初始队列和测试隔离

Status: ready-for-agent
Type: bug
Priority: P1

## Parent

- 代码审查：`server/src/http/create-server.ts`

## What to build

`createRadioServer()` 当前固定使用项目根目录下的 `fakeradio.db` 作为 state DB，并在启动时优先用最新 queue snapshot 恢复播放队列。

问题：

1. 测试通过 `baseDir` 隔离 liked songs，但 state DB 仍写入 `process.cwd()/fakeradio.db`，导致测试之间互相污染。
2. 启动时 `lastQueueSnapshot?.trackIds ?? initialQueue` 会让陈旧快照覆盖当前 music adapter 生成的初始队列。
3. 当前 `pnpm test` 已失败：`uses the selected music adapter for health, initial queue, and next track` 期望初始 queue 来自注入的 music adapter，实际返回空数组。
4. 真实运行时也可能被上一次 provider、上一个 daypart 或损坏/空 snapshot 覆盖当前启动状态。

建议：

1. state DB 路径应基于 `options.baseDir ?? process.cwd()`，或允许测试注入 `stateRepo`。
2. 恢复 queue snapshot 前校验 snapshot 非空、track schema 有效，并且 `blockAt` 与当前 daypart 匹配。
3. 空 snapshot 或过期 snapshot 应回退到 `initialQueue`。

## Acceptance criteria

- [ ] `createRadioServer({ baseDir })` 不再读写项目根目录的共享 `fakeradio.db`
- [ ] 测试环境的 state DB 使用独立临时目录或可注入 repository
- [ ] 空 queue snapshot 不覆盖 `initialQueue`
- [ ] 与当前 daypart 不匹配的 queue snapshot 不覆盖 `initialQueue`
- [ ] `pnpm test` 中 `uses the selected music adapter for health, initial queue, and next track` 通过
- [ ] 新增覆盖“陈旧/空 snapshot 不污染启动队列”的测试

## Blocked by

None - can start immediately

## Verification

```bash
pnpm test
pnpm typecheck
```

## Comments

- 2026-05-09 code review: `pnpm test` 当前失败，收到 queue `[]`，期望注入 adapter 的 `Queue Starter`。
