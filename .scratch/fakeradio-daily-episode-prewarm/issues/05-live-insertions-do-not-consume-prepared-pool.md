# 05 - 插播不污染 prepared pool

Status: needs-triage

## What to build

保证用户播放中临时换歌、讲故事、聊别的时走实时插播链路，不消费 prepared episode pool。插播成功后正常记录 session 和 played history；后续自动播放再次请求 `/api/episode/next` 时，仍能继续从当前时段 prepared pool 领取。

## Acceptance criteria

- [ ] chat intent 中的 next-track、story-background、personal-memory 和默认聊天路径不调用 `claimPreparedEpisode`。
- [ ] 实时插播仍使用当前 provider、DJ brain、TTS 和 session 记录流程。
- [ ] 插播后 prepared pool 的 ready 数量不减少。
- [ ] 插播后的下一次自动 `/api/episode/next` 仍优先领取当前 block 的 prepared episode。
- [ ] 测试覆盖换歌插播、故事插播、普通聊天和插播后回到 prepared pool。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/02-prepared-episode-end-to-end-playback.md`

## Comments

