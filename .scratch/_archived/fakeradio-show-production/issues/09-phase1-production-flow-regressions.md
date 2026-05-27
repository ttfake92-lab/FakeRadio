# 09 Phase 1 制作流回归修复：日志、trace、导出与工程包

Status: completed

## Done Log

- [x] `JobRegistry.updateJob()` 支持非 status 字段更新 (`requireStatusChange=false`)
- [x] `addLog/addTrace` 持久化测试通过 (555/555)
- [x] 前端/后端 ShowProject contract 统一 (`/api/shows`)
- [x] ExportQueue 移除 `planId` fallback
- [x] Export Package `show.mp3` fast-fail 策略
- [x] `show-notes.md` 从 ShowProject 目录读取
- [x] `create-server.ts` 移除 `as any`
- [x] trace 合并与隐私 redaction
- [x] Generation Console 状态守卫

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 1 / Phase 2 前置门禁

## What to fix

在继续 Phase 2 scheduler 前，先修复 Phase 1 用户可见主链路的回归，确保“Generate now -> Generation Console -> Production Board -> Export Package”真的可用。

## Findings

### 1. Job 日志和 trace 不会可靠持久化

`server/src/show/show-generation-job.ts` 的 `updateJob()` 只在 status 变化时落库。`addLog()` 和 `addTrace()` 不改变 status，因此新增日志和 trace 会返回 `null` 且不写入数据库。

### 2. Production Board 导出传错 project id

`apps/web/src/features/show/production-board.tsx` 调用 `exportProject(completedJob.planId, ...)`，但 API `POST /api/projects/:id/export` 需要 `ShowProject.id`。

### 3. Export Package 缺少 `show.mp3`

`server/src/export/export-show-project.ts` 当前只写 `show-plan.json`、`show-notes.md` 和可选 `production-trace.jsonl`。下载白名单也没有 `show.mp3`。

### 4. show notes episode 来源没有绑定 ShowProject

`collectEpisodeTracks()` 硬编码读取 `user/shows/<targetDate>/episode-*.json`，没有读取 `project.directoryPath` 或 ShowProject 索引。

## Acceptance criteria

- [ ] `JobRegistry.addLog()` 和 `JobRegistry.addTrace()` 能持久化到数据库；`jobRegistry.get/list` 能读回新增内容。
- [ ] `generate-now` 用户流创建 job 后，`/api/jobs?briefId=...` 能看到至少 `Job created` 和 `Job started` 级别的日志，trace 不泄漏密钥、cookie、完整 system prompt 或私人记忆原文。
- [ ] Production Board 导出使用真实 `ShowProject.id`，`ExportQueue` 也使用真实 `projectId`。
- [ ] Export Package 最小包含 `show.mp3`、`show-notes.md`、`show-plan.json`、`production-trace.jsonl`；用户选择不包含 trace 时只省略 trace。
- [ ] 下载接口允许下载 `show.mp3`，并返回合理 content-type。
- [ ] `show-notes.md` 从当前 ShowProject 的实际 episode / audio 产物读取曲目、故事摘要、来源和库外曲目加入理由。
- [ ] 用户流级验证覆盖：创建 Brief/Plan、Generate now、Generation Console 日志、Production Board 导出、下载文件列表和单文件下载。

## Suggested implementation order

1. 修 `JobRegistry.updateJob()`，允许 logs/trace/updatedAt 这类非 status 更新落库，同时保持非法状态转换仍返回 `null`。
2. 给 `addLog/addTrace` 增加数据库读回测试，并补 HTTP job route 集成测试。
3. 给 Production Board 增加 `project` 或 `projectId` 输入，避免从 `ShowJob.planId` 推导 project。
4. 修改 `SkinStage` 的 Production Board / ExportQueue 映射，使用 `/api/projects` 返回的 ShowProject。
5. 补齐 Export Package 的 `show.mp3` 产物策略。第一版若无法合成真实音频，应明确失败而不是默默导出缺文件包。
6. 把 show notes 的 episode 收集改为读取 ShowProject 目录或 repository 暴露的工程产物。

## Blocked by

None. 这是继续 Phase 2 前的门禁修复。

## Type

AFK

## Comments

本 issue 不要求实现 Phase 2 scheduler。修完后再回到 `.scratch/fakeradio-show-production/issues/p2-01-scheduler-consume-scheduled-brief.md`。
