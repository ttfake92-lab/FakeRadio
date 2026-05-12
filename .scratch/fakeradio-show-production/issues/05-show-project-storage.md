# 05 ShowProject 本地工程存储

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

建立每期节目工程的本地存储形态：SQLite 保存元数据与状态，文件系统保存节目产物。Production Board、生成控制台和导出流程都应读取同一套工程数据，而不是各自临时拼装。

## Acceptance criteria

- [ ] SQLite 保存 Brief、ShowPlan 版本、job、episode 状态和 trace 索引。
- [ ] 文件系统创建 `user/shows/YYYY-MM-DD-theme-slug/` 工程目录。
- [ ] 工程目录能保存 `show-plan.json`、`production-trace.jsonl` 和后续导出产物。
- [ ] API 能返回单期 ShowProject 的摘要、状态、active ShowPlan 和 trace 文件位置。
- [ ] 用户可删除单期 trace 或整期工程，删除行为有测试覆盖。
- [ ] 私人数据和工程产物默认不进入 git。

## Blocked by

- `.scratch/fakeradio-show-production/issues/01-program-brief-intent-contract.md`
- `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`
- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`

## Type

AFK

## Comments

这不是单纯 repository 重构，而是节目制作系统的工程文件模型。实现时必须尊重本地优先和隐私边界。

