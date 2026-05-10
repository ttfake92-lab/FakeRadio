# 用收藏库生成候选曲目

Status: completed
Type: AFK

## What to build

调整 `/api/next` 的候选生成策略：在当前 daypart、mood rules、近期播放和用户收藏库之间做一个窄闭环，优先从收藏库或收藏库衍生的相邻歌曲中生成候选，而不是直接把泛 mood query 交给网易云搜索并选择第一首。

## Acceptance criteria

- [ ] `/api/next` 能从规范化收藏库中生成一组候选曲目，并保留候选来源信息。
- [ ] 候选生成会避开当前播放和最近已选歌曲。
- [ ] 收藏库为空或候选不可播放时，仍按现有 provider fallback 规则稳定降级。
- [ ] 候选曲目最终仍通过 `MusicAdapter.resolve` 获取可播放 `audioUrl`，不绕过 adapter 边界。
- [ ] 测试覆盖收藏库候选命中、最近播放去重、空收藏库 fallback 和不可解析曲目 fallback。

## Blocked by

- `02-liked-songs-ingestion-and-diagnostics.md`

## Comments

本切片只负责候选来源变准，不要求 LLM rerank 策略一次性完成。
