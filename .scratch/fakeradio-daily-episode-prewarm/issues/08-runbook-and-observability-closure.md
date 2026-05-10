# 08 - 运行手册与观测闭环

Status: needs-triage

## What to build

更新本地运行手册和相关文档，把全天计划预热、歌曲音频预下载、prepared/live 播放来源、独立全天计划准备页和常见失败恢复方式固化到仓库内。文档必须自包含，用户不需要回看对话也能理解如何验证夜间预热是否工作。

## Acceptance criteria

- [ ] `docs/local-runbook.md` 记录 prewarm 相关环境变量、默认值和推荐配置。
- [ ] 文档提供 `/api/prewarm/status` 验证命令和示例输出说明。
- [ ] 文档说明全天计划准备页入口、字段含义和可审计轨迹的边界。
- [ ] 文档说明本地歌曲音频预下载路径、local-first 播放策略和远端回退行为。
- [ ] 文档列出常见失败：provider 不可用、TTS 回退、音频下载失败、prepared pool 为空，以及对应处理方式。
- [ ] README 或架构文档补充一句当前已支持夜间全天计划预热。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/03-nightly-full-day-episode-prewarmer.md`
- `.scratch/fakeradio-daily-episode-prewarm/issues/04-local-track-audio-prefetch-and-local-first-playback.md`
- `.scratch/fakeradio-daily-episode-prewarm/issues/07-full-day-preparation-page-with-audit-trail.md`

## Comments

