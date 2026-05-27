# 22 修复 /api/plan/today 未传 userPreferences.playlists

Status: needs-triage
Type: bug

## Parent

- 代码审查（2026-05-04）：`FakeRadio/server/src/http/create-server.ts:412`

## What to build

`/api/plan/today` 端点调用 `buildTodayPlan` 时没有传用户自定义播放列表：

```typescript
// 当前（错误）
app.get("/api/plan/today", async () =>
  TodayPlanResponseSchema.parse(buildTodayPlan(nowProvider()))
);

// 内部调度（正确）
const currentPlan = buildTodayPlan(nowProvider(), userPreferences.playlists);
```

导致前端展示的今日计划（默认时段块）与服务端实际调度使用的计划（用户自定义播放列表）不一致。

## Acceptance criteria

- [ ] `/api/plan/today` 传入 `userPreferences.playlists`
- [ ] 前端展示的 plan 与内部调度使用的 plan 一致
- [ ] 测试覆盖「有自定义 playlists 时 /api/plan/today 返回对应结构」

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```
