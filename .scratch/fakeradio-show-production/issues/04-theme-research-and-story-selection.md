# 04 主题资料研究与故事驱动选歌

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

让 Theme Story Show 根据 active ShowPlan 做资料研究和故事驱动选歌。系统应优先用户库，允许库外相关曲目最多 60%，不默认避开最近重复，并允许同一艺人连续多首。每首库外曲目必须有加入理由。

## Acceptance criteria

- [ ] 选歌流程读取 Brief、ShowPlan、用户收藏 / 歌单 / 播放历史和外部资料来源。
- [ ] Theme Story Show 不默认排除最近播放曲目。
- [ ] Theme Story Show 允许同一艺人连续多首。
- [ ] 库外曲目默认不超过整期 episode 的 60%，超过时必须记录明确理由或用户授权。
- [ ] 每个 episode selection 记录加入理由和来源，例如 `user-library-match`、`representative-work`、`era-context`、`influence-link`、`cover-version`。
- [ ] 资料不足时降级为听感 / 歌词主题解读，不写无来源事实。
- [ ] 生成结果能被后续 `RadioEpisode` 生成链路消费。

## Blocked by

- `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`
- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`

## Type

AFK

## Comments

这个 slice 不要求完成最终导出，但必须把“为什么选这些歌、为什么这样分段”写进 production trace。

