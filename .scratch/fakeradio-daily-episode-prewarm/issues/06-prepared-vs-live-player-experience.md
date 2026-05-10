# 06 - 前端“秒开感”播放体验优化

Status: needs-triage

## What to build

优化 PWA 播放器在 prepared 命中和实时生成两种路径下的状态表达。prepared episode 命中时减少“准备中”的视觉停留，让早上打开更接近直接播放；实时插播或实时回退时明确显示“正在生成”，避免用户误以为卡住。

## Acceptance criteria

- [ ] shared contract 或前端 API 层能区分 episode 来源是 `prepared` 还是 `live`。
- [ ] prepared 命中时，播放器尽快进入 story 播放状态，并展示“今日节目已就绪”一类低干扰文案。
- [ ] live 生成时，播放器显示明确的实时生成状态，不和 prepared ready 状态混淆。
- [ ] 本地音频命中时，前端能显示低调的 local-first 状态；远端回退时不阻断播放。
- [ ] 测试覆盖 prepared/live 标签、按钮状态、错误文案和 view-model 分支。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/02-prepared-episode-end-to-end-playback.md`
- `.scratch/fakeradio-daily-episode-prewarm/issues/04-local-track-audio-prefetch-and-local-first-playback.md`

## Comments

