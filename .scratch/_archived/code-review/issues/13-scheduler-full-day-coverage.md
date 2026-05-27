# 13 补充 scheduler 全时段覆盖

Status: ready-for-agent
Type: feature

## Parent

- 代码审查：`FakeRadio/server/src/scheduler/radio-scheduler.ts`

## What to build

`buildTodayPlan` 的默认 blocks 只覆盖三个时段：

- `07:00` 早晨轻启动
- `09:00` 写代码专注
- `21:00` 晚间降速

00:00–07:00 和 12:00–21:00 没有对应 block。`getCurrentPlanBlock` 在这些时段会回退到第一个 block（07:00 的"早晨轻启动"），凌晨和下午时段的 DJ 文案可能不合适。

建议补充：

- `00:00` 深夜陪护（ambient night）
- `12:00` 午间轻歇（lunch break chill）
- `14:00` 下午专注（afternoon focus）

## Acceptance criteria

- [ ] 默认 blocks 覆盖 00:00–24:00 的主要时段
- [ ] `getCurrentPlanBlock` 在每个时段返回合适的 block
- [ ] 现有 scheduler 测试继续通过（4 个测试）
- [ ] 新增测试覆盖 00:00、12:00、14:00 等时段

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 注意 `getCurrentPlanBlock` 的逻辑：它选择 `blockMinutes <= currentMinutes` 的最后一个 block，所以 blocks 必须按时间排序。
- 参考 `CONTEXT.md` 中的日常节奏描述。
