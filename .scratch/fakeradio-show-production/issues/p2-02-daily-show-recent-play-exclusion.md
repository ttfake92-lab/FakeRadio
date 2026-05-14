# Phase 2 Issue 2: Daily Show 强避开最近重复

Status: completed
Opened: 2026-05-14

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 2

## What to build

根据 PRD，Daily Show 与 Theme Story Show 的核心区别之一是：
- **Theme Story Show**：不默认避开最近重复，主题完整性优先，允许同艺人连续多首
- **Daily Show**：强避开最近播放，保持日常陪伴的新鲜感

当前 `ThemeSelectionEngine` 已支持 `excludedTrackIds` 参数，但 Daily Show 的选歌逻辑尚未实现（没有 Daily Show 类型的 Brief、没有 RecentPlayedRepository、没有 adapter）。

## Current state

- `ThemeSelectionEngine` 支持 `excludedTrackIds: Set<string>` 参数 ✅
- `ProgramBrief.type` 支持 `"daily-show" | "theme-show" | "block-theme"` ✅
- `RecentPlayedRepository` adapter 接口已存在 ✅
- `DailySelectionEngine` 已存在，但尚未接入 scheduler execution path ⚠️
- `StateRecentPlayedRepository` 已存在 ✅
- `DailyShowPlanGenerator` 已存在，并能生成 morning/afternoon/evening blocks ✅
- scheduler 内部路径能在没有 active plan 时自动生成 daily-show plan ✅
- HTTP `/api/shows/schedule-tonight` 真实主入口仍会用通用 `ShowPlanGenerator` 预先创建 active plan，导致 scheduler 不触发 `DailyShowPlanGenerator` ⛔

## Acceptance criteria

- [x] 定义 `RecentPlayedRepository` adapter 接口（`listRecentlyPlayed(options)` 返回最近播放的 track 列表和排除时间窗口）
- [x] `DailySelectionEngine` 扩展 `ThemeSelectionEngine`，在选歌前读取最近播放记录并传入 `excludedTrackIds`
- [x] Daily Show 选歌：强避开最近 N 天播放的曲目（N 可配置，默认 7 天）
- [x] `DailyShowPlanGenerator` 为 daily-show brief 生成简化的 ShowPlan（按时间段切分 block，而非 story-driven）
- [x] 测试覆盖：最近播放排除、跨时间段避重、不同 brief 类型的选歌差异
- [x] Theme Story Show 选歌行为不变（不避开最近重复）
- [x] HTTP `/api/shows/schedule-tonight` 对 daily-show 使用 `DailyShowPlanGenerator`
- [x] **DailySelectionEngine 注入 scheduler execution path（slice 4）**：当 `brief.type === "daily-show"` 时，`executeScheduledJob` 调用 `DailySelectionEngine.selectForPlan()` 获取选歌结果，将选中曲目 ID 加入 `excludedTrackIds`

## Type

AFK

## Dependencies

- `server/src/show/theme-selection-engine.ts` — 已支持 `excludedTrackIds`
- `packages/shared/src/contracts/radio.ts` — `ProgramBrief.type` 已包含 `"daily-show"`
- `server/src/show/show-plan-generator.ts` — Daily Show 不需要 story-driven blocks

## First slice

**Task P2-2: RecentPlayedRepository 接口 + DailySelectionEngine 测试**

最小可验证行为：
1. 定义 `RecentPlayedRepository` 接口（`listRecentlyPlayed(options?: { since?: Date; limit?: number }): Promise<Track[]>`）
2. 在 `theme-selection-engine.ts` 旁边创建 `daily-selection-engine.ts`，导出 `createDailySelectionEngine(recentPlayedRepo: RecentPlayedRepository): DailySelectionEngine`
3. 写测试：Daily Show 避开最近播放曲目，Theme Show 不避开
4. `createDailySelectionEngine` 内部调用 `createThemeSelectionEngine().selectForPlan(..., excludedTrackIds)`，其中 `excludedTrackIds` 由 recent played tracks 构成
5. 运行 `pnpm vitest run server/src/show/daily-selection-engine.test.ts` 验证

## Done slices

- ✅ First slice：RecentPlayedRepository 接口 + DailySelectionEngine + StateRecentPlayedRepository 适配器
- ✅ Next slice：DailyShowPlanGenerator（morning/afternoon/evening 时间段 block）
- ✅ Next slice 2：Scheduler 内部集成 — `scheduleTonightBriefIfNeeded` 对 daily-show brief 无 plan 时自动生成 plan

## Audit correction - 2026-05-14 20:23 CST

本轮审计发现：scheduler 内部路径虽然能在 `daily-show` brief 没有 active plan 时生成 `morning/afternoon/evening` blocks，但真实用户主入口 `/api/shows/schedule-tonight` 会先调用通用 `showPlanGenerator.generate(brief)` 创建 active plan。由于通用 generator 生成 Theme Story Show 的故事 block，夜间 scheduler 随后会复用该 active plan，不再触发 `DailyShowPlanGenerator`。

因此 P2-02 不能直接进入 “只注入 DailySelectionEngine” 的实现；必须先补齐 HTTP 主入口的 daily-show plan-generator 分流。

## Next slice（in progress: slice 3b / slice 4 前置门禁）

- `/api/shows/schedule-tonight`：当 `brief.type === "daily-show"` 且无 active plan 时，使用 `DailyShowPlanGenerator`，不是通用 `ShowPlanGenerator`
- `/api/shows/generate-now`：如果允许 daily-show，也应使用同一分流，避免 Generate Now 和 Schedule Tonight contract 漂移
- HTTP 级测试覆盖：daily-show 经 `schedule-tonight` 后，`GET /api/plans?briefId=...` 返回的 active plan roles 必须是 `morning` / `afternoon` / `evening`
- 回归测试覆盖：theme-show 经 `schedule-tonight` 后仍保持故事型 roles

## Following slice（slice 4）

- 将 `DailySelectionEngine` 注入到 `executeScheduledJob` 执行路径
- Daily Show 选歌时实际使用 `excludedTrackIds` 强避开最近播放
- 测试覆盖：Daily Show 避开最近播放、Theme Show 不避开

## Files to modify/create

- Create: `server/src/show/daily-selection-engine.ts`
- Create: `server/src/show/daily-selection-engine.test.ts`
- Modify: `packages/shared/src/contracts/radio.ts`（如果需要扩展 RecentPlayedRepository 接口）
- Modify: `server/src/show/theme-selection-engine.ts`（如需导出类型）

## Blocked by

- P2-01（已完成）
