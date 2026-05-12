# 06 Theme Prewarm：Generate now 与 Schedule tonight

Status: resolved
Closed: 2026-05-12 (all criteria met)

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

让 Theme Story Show 支持两种执行方式：`Generate now` 立即生成，用于 MVP 验收和调试；`Schedule tonight` 保存到夜间预热队列，由常驻 server 调度执行。两者必须复用同一套 Brief -> ShowPlan -> episode -> trace job，不做两套逻辑。

## Acceptance criteria

- [ ] `Generate now` 能启动后台 job 并推进到 episode 生成或明确失败状态。
- [ ] `Schedule tonight` 能保存计划，并在 `/api/prewarm/status` 或新 show status 中可见。
- [ ] 夜间调度入口读取同一套 ProgramBrief / ShowPlan / job 逻辑。
- [ ] prepared episode 命中、消费、失败和音频预取状态写入 ShowProject trace。
- [ ] 当前测试红灯中 prepared episode 消费后不复用的问题已修复或被本 slice 前置门禁解决。
- [ ] 测试覆盖立即生成、计划到今晚、取消计划、预热失败降级。

## Blocked by

- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`
- `.scratch/fakeradio-show-production/issues/04-theme-research-and-story-selection.md`
- `.scratch/fakeradio-show-production/issues/05-show-project-storage.md`

## Type

AFK

## Comments

这个 slice 是第一阶段 MVP 的执行闭环。实现前必须先处理当前 `pnpm test` 的 prepared episode 超时失败，避免把新调度建立在不稳定 pool 语义上。

