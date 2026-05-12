# 08 Export Package：节目音频、show notes、ShowPlan 与 trace

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

把完成的 Theme Story Show 导出为本地个人回听节目工程包。最小成品包含 `show.mp3`、`show-notes.md`、`show-plan.json`、`production-trace.jsonl`。导出默认供个人本地回听，不默认公开发布。

## Acceptance criteria

- [ ] 导出任务读取 ShowProject，而不是临时从收藏或当前播放状态拼装。
- [ ] `show.mp3` 包含 DJ 口播和完整歌曲，遵循 Theme Story Show 的口播密度规则。
- [ ] `show-notes.md` 包含节目标题、主题、block 摘要、曲目、故事摘要、来源和库外曲目加入理由。
- [ ] `show-plan.json` 是实际使用的 active ShowPlan 版本。
- [ ] `production-trace.jsonl` 包含制作台日志和摘要级技术 trace。
- [ ] 用户可以选择导出包是否包含 trace。
- [ ] Render / Export Queue 能展示任务状态、失败原因和下载入口。

## Blocked by

- `.scratch/fakeradio-show-production/issues/05-show-project-storage.md`
- `.scratch/fakeradio-show-production/issues/06-theme-prewarm-generate-now-and-schedule-tonight.md`
- `.scratch/fakeradio-show-production/issues/07-collapsible-production-board-and-console-ui.md`

## Type

AFK

## Comments

本 issue 不处理公开发布模式。完整商业歌曲默认只用于个人本地回听。

