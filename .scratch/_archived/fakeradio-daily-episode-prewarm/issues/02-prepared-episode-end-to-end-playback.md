# 02 - 单条 prepared episode 端到端播放

Status: needs-triage

## What to build

让 `/api/episode/next` 能优先播放本地已经准备好的单条 `RadioEpisode`。server 根据当前 radio date 和当前 daypart block 原子领取一条 ready prepared episode，返回给前端，并把它标记为 consumed；如果没有 ready episode，保持现有实时生成链路不变。

## Acceptance criteria

- [ ] `StateRepository` 支持保存 ready prepared episode，并通过事务式 `claimPreparedEpisode(radioDate, blockAt)` 原子领取。
- [ ] 保存前对 `episodeJson` 使用 `RadioEpisodeSchema` 校验，领取时返回类型安全的 `RadioEpisode`。
- [ ] `/api/episode/next` 优先领取当前 block 的 ready episode；命中后注册 track、记录 played history、追加 DJ message。
- [ ] 当前 block 没有 ready episode 时，完整回退到现有实时生成流程。
- [ ] 测试覆盖 prepared 命中、prepared 被 consumed、空池实时回退和并发不重复领取。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/01-prewarm-status-skeleton-and-ui-entry.md`

## Comments

