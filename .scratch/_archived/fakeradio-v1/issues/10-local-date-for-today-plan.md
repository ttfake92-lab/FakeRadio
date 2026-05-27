# 10 当日电台计划使用本地日期

Status: archived
Implemented: 2026-05-08
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

`buildTodayPlan()` 当前用 `toISOString().slice(0, 10)` 生成日期，但 `getCurrentPlanBlock()` 使用本地小时和分钟选择时段。这会导致 Asia/Shanghai 等时区在本地凌晨时，计划日期显示为前一天。

需要让当日电台计划的 `date` 和 daypart 选择使用同一套本地时间语义。

## Acceptance criteria

- [ ] 在 `TZ=Asia/Shanghai` 且本地时间为 `2026-05-01 00:30` 时，`buildTodayPlan(now).date` 返回 `2026-05-01`
- [ ] `getCurrentPlanBlock()` 的行为保持按本地小时选择
- [ ] 新增 scheduler 测试覆盖本地凌晨跨 UTC 日期的 case
- [ ] 文档中“当日电台计划”含义仍与本地优先架构一致

## Blocked by

- None - can start immediately

## Verification

- 2026-05-01 最小复现：`TZ=Asia/Shanghai` 下用 `new Date(2026, 4, 1, 0, 30, 0)` 调用 `buildTodayPlan()`，当前返回 `date: "2026-04-30"`。
- 2026-05-01 修复后验证：`buildTodayPlan()` 已改用本地日期格式；`pnpm test` 通过，scheduler 测试包含 `uses local date even when UTC has crossed to previous day`。

## Comments

- 2026-05-01 implementation update:
  - `buildTodayPlan()` 的 `date` 与 `getCurrentPlanBlock()` 统一使用本地时间语义。
  - 等待人工验收与归档。
