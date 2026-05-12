# FakeRadio Show Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FakeRadio 从本地 AI 音乐电台推进为“AI 生成的个人播客 / 电台制作系统”，先闭合 Theme Story Show MVP，再接入夜间调度和 Daily Show。

**Architecture:** 保持本地优先边界：PWA 只消费本地 server contract，server 负责 ProgramBrief、ShowPlan、job、adapter、scheduler、state、trace 和导出。SQLite 保存状态和索引，文件系统保存每期节目工程产物。

**Tech Stack:** Next.js PWA、Fastify server、TypeScript、Zod shared contracts、SQLite StateRepository、local Markdown issue tracker、FFmpeg、adapter pattern。

***

## 执行顺序

严格按用户指定顺序推进：

1. 重写 / 更新总 PRD：从 FakeRadio V1 改成 “AI 生成的个人播客 / 电台制作系统”。
2. 把已有分支 PRD 映射到新主线。
3. 生成新一期目标 issue：Brief、ShowPlan、Production Board、Theme Prewarm、Export Package。
4. 再处理当前测试失败和 dirty worktree。
5. 最后进入实现。

本计划已完成前 1-3 步的文档落地。后续定时任务应从第 4 步开始。

## 已落地文档

- 新总 PRD：`.scratch/fakeradio-show-production/PRD.md`
- 第一批 issue：`.scratch/fakeradio-show-production/issues/01-*.md` 至 `08-*.md`
- 本计划：`docs/superpowers/plans/2026-05-12-fakeradio-show-production-roadmap.md`

## 当前门禁

### 测试门禁

当前已知验证结果：

- `pnpm typecheck` 通过。
- `pnpm test` 失败 1 个用例：
  - `server/src/http/create-server.test.ts`
  - `createRadioServer > does not reuse a consumed prepared episode on subsequent /api/episode/next calls`
  - 失败形式：5000ms 超时

处理原则：

- 先复现单测。
- 判断是测试 harness 慢、外部 adapter 没有 mock 到位，还是 consumed prepared episode 的 runtime 语义真的卡住。
- 不能通过单纯拉长 timeout 作为最终修复。
- 修复后运行目标测试，再运行全量 `pnpm test && pnpm typecheck`。

### Dirty worktree 门禁

当前工作区存在大量已修改文件和运行态文件。实现前必须分类：

- 应纳入源码 / 测试的变更。
- 应保留但不提交的本地个人数据，例如 `user/audio/`、本地 DB、歌单原始数据。
- 临时调试文件，例如 `inspect-player.js`、`apps/web/inspect-player.mjs`、`player-screenshot.png`。
- 文档 / issue tracker 变更。

处理原则：

- 不 revert 用户或其他 agent 的改动。
- 只整理、记录、必要时更新 `.gitignore`。
- 如果要 commit，先让用户确认 commit 范围。

## Phase 0: 稳定门禁与工作区整理

**Files:**

- Inspect: `server/src/http/create-server.test.ts`
- Inspect: `server/src/http/register-routes.ts`
- Inspect: `server/src/state/state-repository.ts`
- Inspect: `server/src/scheduler/daily-episode-prewarmer.ts`
- Inspect: `package.json`
- Optional modify: `.gitignore`
- Optional modify: affected test / implementation files only after diagnosis

### Task 0.1: 复现 prepared episode 超时失败

- [ ] **Step 1: 运行目标测试**

Run:

```bash
pnpm vitest run server/src/http/create-server.test.ts -t "does not reuse a consumed prepared episode"
```

Expected: 当前应复现 timeout 或暴露更具体错误。

- [ ] **Step 2: 加最小诊断，不改产品行为**

检查该测试是否触发真实 `publicMetadataAdapter` / `webResearchAdapter` timeout。优先在测试 setup 注入 mock story source、public metadata、web research adapter，而不是让 fallback 路径访问真实超时逻辑。

- [ ] **Step 3: 修复测试或实现**

如果是测试缺少 mock，补齐 test harness。\
如果是 `claimPreparedEpisode` / consumed 状态错误，修复 `StateRepository` 或 route claim 逻辑。

- [ ] **Step 4: 验证**

Run:

```bash
pnpm vitest run server/src/http/create-server.test.ts -t "prepared episode"
pnpm test
pnpm typecheck
```

Expected: 全部通过。

### Task 0.2: 工作区分类

- [ ] **Step 1: 查看状态**

Run:

```bash
git status --short --branch
git diff --stat
```

- [ ] **Step 2: 分类文件**

生成一份本地整理清单，至少包含：

- source/test changes
- docs/issues changes
- local private data
- runtime artifacts
- temporary debug files
- [ ] **Step 3: 处理 ignore**

如果 `user/audio/`、本地 show 工程、导出 ZIP、临时截图尚未忽略，补充 `.gitignore`。不要删除用户个人数据。

- [ ] **Step 4: 用户确认**

在进入实现前，向用户汇报哪些文件建议提交、哪些建议保留本地、哪些建议删除或 ignore。

## Phase 1: Theme Story Show MVP

第一阶段只追一条主链路：

用户说“做一期 Bee Gees 主题节目” -> `ProgramBrief` -> `ShowPlan draft` -> `Generate now` -> 生成日志 -> Production Board -> Export Package。

### Task 1: ProgramBrief contract + intent parsing

**Issue:** `.scratch/fakeradio-show-production/issues/01-program-brief-intent-contract.md`

**Files:**

- Modify: `packages/shared/src/contracts/radio.ts`
- Test: `packages/shared/src/contracts/radio.test.ts`
- Create: `server/src/show/program-brief-repository.ts`
- Test: `server/src/show/program-brief-repository.test.ts`
- Modify: `server/src/http/chat-intent-router.ts`
- Modify: `server/src/http/register-routes.ts`
- Test: `server/src/http/create-server.test.ts`
- [ ] **Step 1: Add failing contract tests for ProgramBrief**
- [ ] **Step 2: Implement Zod schema and exported type**
- [ ] **Step 3: Add repository tests for save/list/get/update status**
- [ ] **Step 4: Implement repository using local state conventions**
- [ ] **Step 5: Add chat intent tests for theme-show, block-theme, weak expression**
- [ ] **Step 6: Implement intent parsing and light confirmation**
- [ ] **Step 7: Run targeted tests and commit**

Commands:

```bash
pnpm vitest run packages/shared/src/contracts/radio.test.ts
pnpm vitest run server/src/show/program-brief-repository.test.ts server/src/http/create-server.test.ts -t "brief"
pnpm typecheck
```

### Task 2: ShowPlan versioning

**Issue:** `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`

**Files:**

- Modify: `packages/shared/src/contracts/radio.ts`
- Test: `packages/shared/src/contracts/radio.test.ts`
- Create: `server/src/show/show-plan-repository.ts`
- Create: `server/src/show/show-plan-generator.ts`
- Test: `server/src/show/show-plan-generator.test.ts`
- Modify: `server/src/http/register-routes.ts`
- [ ] **Step 1: Add ShowPlan contract tests**
- [ ] **Step 2: Implement ShowPlan schemas with constrained block roles**
- [ ] **Step 3: Add generator tests for 4-8 blocks and active version**
- [ ] **Step 4: Implement generator using LLM adapter with deterministic mock path**
- [ ] **Step 5: Add version repository and API route**
- [ ] **Step 6: Verify old versions are not overwritten**
- [ ] **Step 7: Run tests and commit**

Commands:

```bash
pnpm vitest run packages/shared/src/contracts/radio.test.ts server/src/show/show-plan-generator.test.ts
pnpm typecheck
```

### Task 3: Background job and generation logs

**Issue:** `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`

**Files:**

- Create: `server/src/show/show-generation-job.ts`
- Create: `server/src/show/production-trace.ts`
- Test: `server/src/show/show-generation-job.test.ts`
- Modify: `server/src/http/register-routes.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- [ ] **Step 1: Test job state transitions**
- [ ] **Step 2: Implement job registry with** **`pending/running/paused/needs-replan/cancelled/failed/completed`**
- [ ] **Step 3: Test production log redaction**
- [ ] **Step 4: Implement trace writer with production log and technical trace levels**
- [ ] **Step 5: Add API for start/status/pause/cancel/add-constraint**
- [ ] **Step 6: Run tests and commit**

Commands:

```bash
pnpm vitest run server/src/show/show-generation-job.test.ts
pnpm typecheck
```

### Task 4: Theme research and story selection

**Issue:** `.scratch/fakeradio-show-production/issues/04-theme-research-and-story-selection.md`

**Files:**

- Create: `server/src/show/theme-selection-engine.ts`
- Test: `server/src/show/theme-selection-engine.test.ts`
- Modify: `server/src/http/episode-runner.ts`
- Modify: `server/src/adapters/story-source/*` only if adapter boundary requires it
- [ ] **Step 1: Test user-library priority**
- [ ] **Step 2: Test external track cap at 60%**
- [ ] **Step 3: Test no recent-repeat avoidance for Theme Story Show**
- [ ] **Step 4: Test same artist can appear consecutively**
- [ ] **Step 5: Implement selection engine and trace reasons**
- [ ] **Step 6: Run tests and commit**

Commands:

```bash
pnpm vitest run server/src/show/theme-selection-engine.test.ts
pnpm test
```

### Task 5: ShowProject storage

**Issue:** `.scratch/fakeradio-show-production/issues/05-show-project-storage.md`

**Files:**

- Modify: `server/src/state/state-repository.ts`
- Test: `server/src/state/state-repository.test.ts`
- Create: `server/src/show/show-project-repository.ts`
- Test: `server/src/show/show-project-repository.test.ts`
- Modify: `.gitignore` if needed
- [ ] **Step 1: Add DB tests for show project metadata**
- [ ] **Step 2: Add filesystem tests for** **`user/shows/YYYY-MM-DD-theme-slug/`**
- [ ] **Step 3: Implement repository**
- [ ] **Step 4: Add delete trace / delete project behavior**
- [ ] **Step 5: Verify private project files are ignored**
- [ ] **Step 6: Run tests and commit**

Commands:

```bash
pnpm vitest run server/src/state/state-repository.test.ts server/src/show/show-project-repository.test.ts
pnpm typecheck
```

### Task 6: Generate now and Schedule tonight

**Issue:** `.scratch/fakeradio-show-production/issues/06-theme-prewarm-generate-now-and-schedule-tonight.md`

**Files:**

- Modify: `server/src/scheduler/daily-episode-prewarmer.ts`
- Modify: `server/src/scheduler/scheduler-loop.ts`
- Modify: `server/src/http/register-routes.ts`
- Test: `server/src/scheduler/daily-episode-prewarmer.test.ts`
- Test: `server/src/http/create-server.test.ts`
- [ ] **Step 1: Test Generate now starts job and writes trace**
- [ ] **Step 2: Test Schedule tonight persists queued work**
- [ ] **Step 3: Test scheduler consumes queued Theme Show Brief**
- [ ] **Step 4: Reuse same job path for immediate and scheduled execution**
- [ ] **Step 5: Verify prepared episode consumed semantics remain green**
- [ ] **Step 6: Run tests and commit**

Commands:

```bash
pnpm vitest run server/src/scheduler/daily-episode-prewarmer.test.ts server/src/http/create-server.test.ts -t "show|prewarm|prepared"
pnpm test
pnpm typecheck
```

### Task 7: Collapsible UI panels

**Issue:** `.scratch/fakeradio-show-production/issues/07-collapsible-production-board-and-console-ui.md`

**Files:**

- Modify: `apps/web/src/features/player/player-shell.tsx`
- Modify: `apps/web/src/features/player/use-radio-bridge.ts`
- Modify: `apps/web/src/features/player/skin-stage.tsx`
- Modify: `apps/web/src/features/player/skins.css`
- Create: `apps/web/src/features/show/production-board.tsx`
- Create: `apps/web/src/features/show/generation-console.tsx`
- Create: `apps/web/src/features/show/export-queue.tsx`
- Test: relevant `apps/web/src/features/player/*.test.ts`
- [ ] **Step 1: Add view-model tests for panel open/close state**
- [ ] **Step 2: Implement shared panel contract**
- [ ] **Step 3: Add Production Board component**
- [ ] **Step 4: Add Generation Console component with log stream first**
- [ ] **Step 5: Add Export Queue placeholder bound to real API status**
- [ ] **Step 6: Adapt all five skins to the same semantic slots**
- [ ] **Step 7: Browser verify small window, mobile portrait, wider desktop**
- [ ] **Step 8: Run tests and commit**

Commands:

```bash
pnpm vitest run apps/web/src/features/player/player-view-model.test.ts apps/web/src/features/player/use-radio-bridge.test.ts
pnpm typecheck
pnpm dev
```

Browser verification should inspect the actual local app and confirm the default view remains listening desk + chat, with panels closed by default.

### Task 8: Export Package

**Issue:** `.scratch/fakeradio-show-production/issues/08-export-package-with-plan-and-trace.md`

**Files:**

- Modify: `server/src/export/export-pipeline.ts`
- Modify: `server/src/export/show-notes-generator.ts`
- Test: `server/src/export/export-pipeline.test.ts` if created, otherwise add focused tests beside existing export tests
- Test: `server/src/export/show-notes-generator.test.ts`
- Modify: `server/src/http/register-routes.ts`
- [ ] **Step 1: Test export reads ShowProject**
- [ ] **Step 2: Test** **`show-notes.md`** **includes block summaries, sources, external track reasons**
- [ ] **Step 3: Test package includes** **`show.mp3`,** **`show-notes.md`,** **`show-plan.json`,** **`production-trace.jsonl`**
- [ ] **Step 4: Implement export from project directory**
- [ ] **Step 5: Add option to exclude trace**
- [ ] **Step 6: Run tests and commit**

Commands:

```bash
pnpm vitest run server/src/export/show-notes-generator.test.ts server/src/export/audio-mixer.test.ts
pnpm test
pnpm typecheck
```

## 推荐定时任务设置

用户可以给 Codex 设置一个每日自动推进任务，建议 prompt 如下：

```text
在 /Users/tt/projects/FakeRadio 按 docs/superpowers/plans/2026-05-12-fakeradio-show-production-roadmap.md 推进项目。
先读取 AGENTS.md、.scratch/fakeradio-show-production/PRD.md、对应 issue 和当前 git status。
严格遵守顺序：先处理当前测试失败和 dirty worktree，再进入 Phase 1 实现。
每次只推进一个可验证小 slice；优先写测试，运行相关测试和 typecheck。
不要 revert 用户未明确要求回退的改动。
结束时用中文汇报：完成了什么、改了哪些文件、验证结果、下一次应该从哪里继续。
```

建议频率：

- 如果希望稳：每天凌晨一次，先处理门禁和一个小 slice。
- 如果希望快：每天两次，上午处理实现，晚上处理验证和整理。
- 每次任务时间盒：60-120 分钟，避免在 dirty worktree 中长时间漂移。

## 自动推进检查清单

每次定时任务开始：

- [ ] 读取 `AGENTS.md`。
- [ ] 读取本计划。
- [ ] 读取当前 active issue。
- [ ] 运行 `git status --short --branch`。
- [ ] 如果上次有失败测试，先复现失败。

每次定时任务结束：

- [ ] 更新对应 issue 的 Comments。
- [ ] 记录运行过的测试命令和结果。
- [ ] 明确下一次 active issue / task。
- [ ] 如果创建 commit，确保不包含个人数据、缓存、DB 或临时截图。
- [ ] 如果无法继续，写清楚 blocker 和需要用户确认的问题。

## 暂不进入的工作

- 不做公开发布模式。
- 不做去版权版导出。
- 不做复杂在线重排。
- 不把完整 chain-of-thought 暴露给 UI。
- 不把 provider 逻辑放进前端。
- 不为了新目标重写五套皮肤，只做 contract 统一适配。

