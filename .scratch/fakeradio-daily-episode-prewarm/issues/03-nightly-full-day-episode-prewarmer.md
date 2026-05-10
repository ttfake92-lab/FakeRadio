# 03 - 夜间全天计划预热任务

Status: needs-triage

## What to build

新增 server 内部的夜间 `daily-prewarm` 任务。server 常驻时，每天晚上按明天的 `buildTodayPlan` 为全部 daypart blocks 准备完整 `RadioEpisode` 池，默认每个 block 3 条；单条失败只记录失败原因，不中断整晚任务。

## Acceptance criteria

- [ ] 新增 `daily-episode-prewarmer`，复用现有选歌、资料收集、故事生成和 TTS 合成能力生成完整 `RadioEpisode`。
- [ ] 支持 `FAKERADIO_PREWARM_ENABLED`、`FAKERADIO_PREWARM_TIME`、`FAKERADIO_PREWARM_EPISODES_PER_BLOCK` 配置及默认值。
- [ ] scheduler 在本地 server 常驻时按预热时间触发，并通过 last-run date 避免同一天重复触发。
- [ ] 每个 block 只补足缺口，不重复生成已有足量 ready episode。
- [ ] 单条 episode 失败时写入 failed 状态和 error，其他 episode 继续生成。
- [ ] 测试覆盖全日 block 遍历、补足逻辑、失败隔离、禁用预热和重复触发保护。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/02-prepared-episode-end-to-end-playback.md`

## Comments

