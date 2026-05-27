# 07 - 独立全天计划准备页与可审计轨迹

Status: needs-triage

## What to build

新增独立全天计划准备页面，用于查看每个 daypart 的准备状态、歌曲、文稿、TTS、本地音频下载结果和每条 episode 的准备轨迹。页面展示可解释、可审计的信息，例如选歌 query、候选歌曲、最终选择理由、资料来源、文稿生成结果、TTS cache key、音频下载状态和失败原因；不展示模型内部隐藏推理逐字稿。

## Acceptance criteria

- [ ] 新增独立页面，例如 `/schedule` 或 `/plan`，不挤进默认 `On Air` 页面。
- [ ] server 状态接口提供每个 block 的 episode 列表和准备轨迹摘要。
- [ ] 页面按全天 daypart 分组展示 ready、consumed、failed 和 preparing 状态。
- [ ] 每条 episode 能展开查看选歌、文稿、资料来源、TTS、音频下载和错误信息。
- [ ] 页面说明“可审计轨迹”是系统记录和模型输出摘要，不是隐藏推理逐字稿。
- [ ] 测试覆盖 API contract、页面数据映射、空状态、失败状态和长文本布局。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/01-prewarm-status-skeleton-and-ui-entry.md`
- `.scratch/fakeradio-daily-episode-prewarm/issues/03-nightly-full-day-episode-prewarmer.md`
- `.scratch/fakeradio-daily-episode-prewarm/issues/04-local-track-audio-prefetch-and-local-first-playback.md`

## Comments

