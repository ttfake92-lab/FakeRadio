# 37 StateRepository 今日查询使用 UTC 日期导致本地日期边界错误

Status: ready-for-agent
Type: bug
Priority: P2

## Parent

- 代码审查：`server/src/state/state-repository.ts`
- 相关 issue：`.scratch/code-review/issues/25-unify-asia-shanghai-timezone-contract.md`

## What to build

`StateRepository` 的 `getDjMessagesToday()` 和 `getStartupState()` 当前使用 `new Date().toISOString().split("T")[0]` 计算今天。这是 UTC 日期，不是 FakeRadio 本地电台日期。

项目运行脚本和 runbook 都以 `Asia/Shanghai` 为本地语义；在北京时间 00:00-07:59 期间，UTC 日期仍是前一天，会导致：

1. 今天的 DJ message 查询漏掉当天早间消息。
2. 日终导出或品味推断可能混入错误日期范围。
3. 启动恢复的 `todayDjMessages` 与 `/api/plan/today` 的本地日期语义不一致。

建议：

1. 复用 `formatRadioDate()` 生成本地 radio date。
2. DJ message 表增加 `radio_date` 字段，写入时固定记录本地日期；查询时按 `radio_date` 查，而不是对 ISO 字符串做前缀比较。
3. 如果暂不迁移 schema，至少用本地当天起始时间计算 `created_at >= localStartIso`。

## Acceptance criteria

- [ ] `appendDjMessage()` 写入可按 Asia/Shanghai 日期查询的字段或等价索引
- [ ] `getDjMessagesToday()` 使用本地 radio date 语义
- [ ] `getStartupState().todayDjMessages` 使用同一日期语义
- [ ] 新增测试覆盖北京时间 00:30 时不会落到前一天 UTC 日期
- [ ] 更新 docs 或 ADR，说明 state 层“今天”与 `formatRadioDate()` 保持一致

## Blocked by

- `.scratch/code-review/issues/25-unify-asia-shanghai-timezone-contract.md`

## Verification

```bash
TZ=Asia/Shanghai pnpm --filter @fakeradio/server test
pnpm typecheck
```

## Comments

- 2026-05-09 code review: 当前实现使用 `toISOString().split("T")[0]`，这是 UTC 日期切分。
