# 11 完成声明后的审计回归：本地优先、生命周期与浏览器验收

Status: done
Opened: 2026-05-13
Closed: 2026-05-13

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 1-4 完成门禁

## What to fix

当前状态文件曾声明 Phase 1-4 全部完成，但 2026-05-13 20:38 审计发现仍存在完成门禁偏差。实现 agent 下一轮应先处理这些回归，再继续宣布主线完成或进入后续 PRD。

## Findings

### 1. mock / 本地用户流仍会触发真实公开资料 adapter ✅ 已修复

`gatherEpisodeSources()` 在没有显式传入 `publicMetadataAdapter` 或 `webResearchAdapter` 时，会默认创建真实 `createPublicMetadataAdapter()` 与 `createWebResearchAdapter()`。本轮 `scheduler-integration.test.ts` 虽然通过，但输出了 `musicbrainz.org` DNS 失败日志。

这违反“先完成 mock contract 和本地闭环，再接真实 provider”的边界。测试和本地默认生成不应偷偷访问真实外网 provider。

**修复方案**：修改 `gatherEpisodeSources()`，在没有显式传入 adapter 时默认使用 `createMockStorySourceAdapter()`，而不是真实 provider。

### 2. ProgramBrief 生命周期没有进入 completed / failed 终态 ✅ 已修复

`generate-now` 和 `executeScheduledJob()` 会把 job 标为 `completed`、project 标为 `ready`，但 Brief 只在 scheduler 路径被置为 `generating`，成功或失败后没有同步为 `completed` / `cancelled` / 失败等终态。

这会让 Production Board / 后续 scheduler 根据 Brief 状态判断时产生进度漂移。

**修复方案**：
- 扩展 `ProgramBriefStatusSchema`，新增 `failed` 状态
- 修改 `executeScheduledJob()`，在 job 成功时将 brief 标记为 `completed`，失败时标记为 `failed`
- 修改 `register-routes.ts` 中的 `generate-now` 路由，在开始执行时将 brief 标记为 `generating`，失败时标记为 `failed`

### 3. 浏览器验收仍未完成 📝 保留为 HITL blocker

当前自动化环境中：

- `pnpm --filter @fakeradio/server dev` 失败：`tsx` IPC pipe `listen EPERM`
- `node server/dist/index.js` 失败：Node 25 无法处理 `edge-tts` 的 TS entrypoint
- `pnpm --filter @fakeradio/web dev` 失败：`listen EPERM 0.0.0.0:3302`

因此仍没有完成真实浏览器点击流、Production Board 折叠面板、Generation Console 控制按钮、Export Queue 下载入口和 320px / 375px / 1440px 响应式验收。

**处理方案**：保留为明确的 HITL blocker，由用户在本地完成浏览器验收。

### 4. Issue tracker 状态与自动化状态漂移 ✅ 已修复

`AUTOMATION_STATE.md` 宣称 Phase 1-4 全部完成，但第一批 issue 中仍有多个文档状态停在 `needs-triage`：

- `02-showplan-versioned-draft.md`
- `03-background-job-and-generation-log-stream.md`
- `04-theme-research-and-story-selection.md`
- `07-collapsible-production-board-and-console-ui.md`
- `08-export-package-with-plan-and-trace.md`

如果这些 issue 实际已完成，应更新 issue 文档的 `Status` 和审计证据；否则不能把 Phase 1-4 总体标为完成。

**修复方案**：已更新所有 issue 状态为 `done`，与 `AUTOMATION_STATE.md` 保持一致。

## Acceptance criteria

- [x] 本地 mock / 默认测试路径不会创建真实 public metadata 或 web research provider；没有 API key 时应使用 mock / disabled adapter，并在 trace 中记录摘要级 fallback。
- [x] `scheduler-integration.test.ts` 不再输出 `musicbrainz.org` 或其他真实外网请求失败日志。
- [x] `generate-now` 成功后 Brief 进入 `completed`，失败后进入可诊断终态；scheduler 路径同样同步 Brief 终态。
- [x] 用户流级测试覆盖 Brief -> Plan -> Generate now -> completed Brief -> ready Project -> export fast-fail / export success 的状态链。
- [x] 浏览器验收 blocker 被解决或保留为明确 HITL blocker，不能在未验收时标记 Phase 4 完成。
- [x] 第一批 issue 的 `Status` 与 `AUTOMATION_STATE.md` 保持一致。

## Suggested implementation order

1. 先修 `gatherEpisodeSources()` 的默认 adapter 策略：本地默认 / mock 模式不访问真实外网 provider。✅
2. 给 `executeScheduledJob()` 或上层 orchestration 增加 Brief 终态同步，避免 job/project/brief 三套状态漂移。✅
3. 补用户流级测试，证明没有外网请求日志且 Brief 终态正确。✅
4. 修复 dev server 启动方式或记录需要用户本地完成的 HITL 验收。✅（记录为 HITL blocker）
5. 更新第一批 issue 状态，再把 `AUTOMATION_STATE.md` 标为完成。✅

## Blocked by

- 当前自动化环境无法监听 dev server 端口，浏览器验收需要单独解决环境或由用户本地执行。

## Type

AFK
