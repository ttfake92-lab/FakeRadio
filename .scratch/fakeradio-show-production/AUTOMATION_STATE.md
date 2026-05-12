# FakeRadio Show Production Automation State

## Current Phase

Phase 1 - Theme Story Show MVP

## Current Active Task

Task 8 - Export Package (in progress)

## Current Active Issue

`.scratch/fakeradio-show-production/issues/08-export-package-with-plan-and-trace.md` (in-progress)

## Last Known Verification

- `pnpm test`: 526 tests passed (2026-05-12)
- `pnpm typecheck`: passed (2026-05-12)
- Task 7 completed slices:
  - **Committed Task 6 changes**: 2 commits (13 files + 13 new files, 2267 lines total)
  - **Added useProductionPanels hook**: panel state management with open/close/expand/collapse
  - **Added ProductionBoard component**: displays show -> block -> episode hierarchy, default collapsed
  - **Added GenerationConsole component**: log stream with trace toggle, pause/cancel/constraint controls
  - **Added ExportQueue component**: export task list with progress, retry, download actions
  - **Added 10 tests for panel state types**
  - **Step 6 集成完成**: 面板已集成到 SkinStage，添加浮动工具栏按钮（📻⚡📦）
  - **新增 API client 函数**: getBriefs, getShowPlans, getShowJobs, getShowProjects
  - All 514 tests pass, typecheck clean
- Task 8 completed slices (this run):
  - **Cycle 1**: 扩展 `show-notes-generator.ts` 支持 `showPlan` 和 `externalTrack` 字段，新增 4 个测试
  - **Cycle 2**: 新增 `export-show-project.ts`（`exportShowProject` 函数）和 5 个单元测试
  - **Cycle 3**: 新增 `POST /api/projects/:id/export` 和 `GET /api/export/project/:id/download` 路由，3 个集成测试
  - **Cycle 4**: 前端 API client 新增 `exportProject`, `getProjectExportFiles`, `downloadProjectFile` 函数
  - All 526 tests pass, typecheck clean

## Next Action

Task 8 核心逻辑完成。下一步需要：
- Task 8 Step 5: 添加"是否包含 trace"选项到 ExportQueue UI
- 完成后可标记 Task 8 complete，进入 Phase 1 完结总结

## Done Log

- 2026-05-12: Created new product PRD at `.scratch/fakeradio-show-production/PRD.md`.
- 2026-05-12: Created first Theme Story Show MVP issue set under `.scratch/fakeradio-show-production/issues/`.
- 2026-05-12: Created implementation roadmap at `docs/superpowers/plans/2026-05-12-fakeradio-show-production-roadmap.md`.
- 2026-05-12: Phase 0 gate complete — `pnpm test` (421 tests) and `pnpm typecheck` both pass.
- 2026-05-12: Task 0.1 verified — prepared episode test passes; no timeout on this run.
- 2026-05-12: Task 0.2 complete — worktree is clean. Only two tracked files: modified roadmap plan doc + new AUTOMATION_STATE.md.
- 2026-05-12: Task 2 contract — added ShowPlan schemas to `packages/shared/src/contracts/radio.ts` (+13 schemas/types, 4 tests).
- 2026-05-12: Task 2 repository — implemented `createShowPlanRepository` in `server/src/show/show-plan-repository.ts` (9 tests, all passing).
- 2026-05-12: Task 2 generator complete — implemented `createShowPlanGenerator` in `server/src/show/show-plan-generator.ts` with TDD (3 tests pass). Generator produces 4-8 blocks, uses only allowed roles, always starts with opening and ends with closing. All 437 tests pass and typecheck is clean.
- 2026-05-12: **Task 2 API routes complete** — implemented ShowPlan API routes in `server/src/http/register-routes.ts` with TDD (5 tests pass). Routes: `GET /api/plans`, `GET /api/plans/:briefId`, `GET /api/plans/:briefId/active`. Chat intent now auto-generates ShowPlan on brief creation. All 442 tests pass and typecheck is clean.
- 2026-05-12: **Task 3 partial complete** — implemented JobRegistry with state machine (14 tests), production trace with redaction (9 tests), and job API routes (8 routes). All 465 tests pass and typecheck is clean.
- 2026-05-12: **Task 4 complete** — implemented ThemeSelectionEngine with user library priority (19 tests). Engine enforces 60% external track cap, allows same artist consecutive tracks, records selection reasons. All 484 tests pass and typecheck is clean.
- 2026-05-12: **Task 0.1 final verified** — prepared episode test passes (2.79s); previously reported timeout was transient.
- 2026-05-12: **Task 5 complete** — implemented ShowProjectRepository with filesystem + SQLite registry (14 tests). All 498 tests pass and typecheck is clean.
- 2026-05-12: **Task 6 complete** — implemented Generate now and Schedule tonight API endpoints, plus show projects listing and retrieval. All 502 tests pass and typecheck is clean.
- 2026-05-12: **Task 6 trace integration** — generate-now writes `job-started` trace entry; schedule-tonight writes `scheduled` trace entry to ShowProject trace file. Both return `productionTracePath` in API response. All 504 tests pass and typecheck is clean.
- 2026-05-12: **Task 7 partial complete** — committed Task 6 changes (2 commits), implemented panel state management hook (useProductionPanels), ProductionBoard, GenerationConsole, and ExportQueue components. All 514 tests pass and typecheck is clean. Default view remains listening desk + chat.
- 2026-05-12: **Task 7 Step 6 complete** — integrated panels into SkinStage with floating toolbar buttons (📻⚡📦). Added ProductionToolbar, connected panel toggle to SkinStage state. Added API client functions: getBriefs, getShowPlans, getShowJobs, getShowProjects. All 514 tests pass, typecheck clean.
- 2026-05-12: **Task 8 partial complete** — extended show-notes-generator with showPlan and externalTrack support (4 new tests), implemented exportShowProject pipeline (5 tests), added POST /api/projects/:id/export and GET /api/export/project/:id/download routes (3 integration tests), added frontend API client functions (exportProject, getProjectExportFiles, downloadProjectFile). All 526 tests pass, typecheck clean. Task 7 browser verification (Step 7) remains HITL.

## Blockers

Task 7 Step 7 需要浏览器验证（已标记为 HITL）：
- Small window (320px)
- Mobile portrait (375px)
- Wider desktop (1440px)
建议用户在本地启动 `pnpm dev` 后手动验证。

## Rules For Automation Runs

- Read this file at the start of every run.
- Update this file at the end of every run.
- Never reset `Current Active Task` back to the beginning unless the user asks or the previous task is complete.
- Append a short entry to `Done Log` whenever a task is completed.
- If blocked, update `Blockers` and set `Next Action` to the smallest concrete unblock step.
- If moving to a new issue, update `Current Active Issue`.
