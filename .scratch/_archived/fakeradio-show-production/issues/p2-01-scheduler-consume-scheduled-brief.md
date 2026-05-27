# Phase 2 Issue 1: Scheduler 消费 Theme Show Brief

Status: completed
Opened: 2026-05-12

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 2

## What to build

让常驻 server 的 scheduler 在夜间触发时，从 ProgramBriefRepository 读取 `status: "scheduled"` 的 Brief，然后执行同一套 ShowPlan -> episode -> trace job 链路。

## Current state

- `POST /api/shows/schedule-tonight` ✅ 已实现（保存 Brief + 创建 Project + 写 trace）
- `createPrewarmScheduler` ✅ 已实现（每日定时触发 `onPrewarmTick`）
- `show-generation-job.ts` ✅ 已实现（JobRegistry state machine；尚无完整 episode execution contract）
- `server/src/show/scheduler-integration.ts` ✅ partial（读取 scheduled Brief、找到 active ShowPlan、创建并启动 job）
- **缺失**：scheduler 启动的 job 尚未执行 ShowPlan -> episode -> TTS/audio -> ShowProject trace 的完整生成链路

## Acceptance criteria

- [ ] 常驻 server 启动时，如果存在 `status: "scheduled"` 且 `targetDate` 为今天的 Brief，scheduler 应在 `prewarmTime` 触发后执行该 Brief 的生成 job。
- [ ] `runPrewarmForDate` 改为优先使用 ThemeShow 的 Brief/ShowPlan/job，而不是旧的 Daily Show block 逻辑。
- [ ] Phase 1 的 ThemeShow job 路径（ShowPlan -> episode -> trace）和 `generate-now` 使用同一套逻辑，不写两套。
- [ ] 测试覆盖：scheduler 在有 scheduled Brief 时触发 job，无 scheduled Brief 时跳过。

## Blocked by

- `.scratch/fakeradio-show-production/issues/09-phase1-production-flow-regressions.md`

## Type

AFK

## Dependencies

- `server/src/scheduler/scheduler-loop.ts` — `createPrewarmScheduler`
- `server/src/show/show-generation-job.ts` — `JobRegistry.create/start/addLog/addTrace`
- `server/src/show/program-brief-repository.ts` — `list({ status: "scheduled" })`
- `server/src/show/show-plan-generator.ts` — `generate()`
- `server/src/http/create-server.ts` — server bootstrap

## First slice

**Task P2-1: Scheduler 读取 scheduled Brief 并触发 job**

最小可验证行为：
1. 测试：当存在 `status: "scheduled"` 且 `targetDate` 匹配的 Brief 时，server bootstrap 的 `onPrewarmTick` 复用 generate-now 的 Brief -> active ShowPlan -> JobRegistry create/start -> project trace 路径
2. 实现：保持 `createPrewarmScheduler` 只负责定时触发；不要把 repository 或 job orchestration 注入 `scheduler-loop.ts`
3. 验证：`pnpm vitest run server/src/scheduler/` 相关测试

## Audit notes

2026-05-13 审计发现：当前 `JobRegistry` 没有 `execute` 方法，旧 First slice 会诱导实现 agent 调用不存在的 API 并扩大 `scheduler-loop.ts` 职责。P2-1 应在 server orchestration 层消费 scheduled Brief，scheduler loop 保持纯定时器边界。

同日后续实现已新增 `server/src/show/scheduler-integration.ts` 并在 `create-server.ts` 的 `onPrewarmTick` 调用。该实现只完成“创建并启动 job”，尚未完成 episode 生成、ShowProject trace、Export Package 产物闭环；且会受 `JobRegistry.addLog/addTrace` 不落库问题影响。继续本 issue 前先完成 `09-phase1-production-flow-regressions.md`。
