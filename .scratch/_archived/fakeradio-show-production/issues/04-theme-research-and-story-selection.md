# 04 主题资料研究与故事驱动选歌

Status: done

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

让 Theme Story Show 根据 active ShowPlan 做资料研究和故事驱动选歌。系统应优先用户库，允许库外相关曲目最多 60%，不默认避开最近重复，并允许同一艺人连续多首。每首库外曲目必须有加入理由。

## Acceptance criteria

- [x] 选歌流程读取 Brief、ShowPlan、用户收藏 / 歌单 / 播放历史和外部资料来源。
- [x] Theme Story Show 不默认排除最近播放曲目。
- [x] Theme Story Show 允许同一艺人连续多首。
- [x] 库外曲目默认不超过整期 episode 的 60%，超过时必须记录明确理由或用户授权。
- [x] 每个 episode selection 记录加入理由和来源，例如 `user-library-match`、`representative-work`、`era-context`、`influence-link`、`cover-version`。
- [x] 资料不足时降级为听感 / 歌词主题解读，不写无来源事实。
- [x] 生成结果能被后续 `RadioEpisode` 生成链路消费。

## Blocked by

- `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`
- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`

## Type

AFK

## Comments

2026-05-13: 已完成实现。包含完整的 theme-selection-engine，支持故事驱动的选歌逻辑。

