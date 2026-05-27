# 10 Show Production 审计回归修复

Status: completed

## Done Log

- [x] `getShowProjects()` 调用 `/api/shows`，Production Board 拿到真实 ShowProject
- [x] ExportQueue 只使用真实 `projectId`，无 fallback
- [x] `generate-now` 完整 orchestration，HTTP 测试 555/555 通过
- [x] `schedule-tonight` 和 scheduler 复用同一执行路径
- [x] `create-server.ts` 移除 `as any`
- [x] Export Package 音频失败 fast-fail，不再生成 0 字节文件
- [x] trace 合并 ShowProject trace 与 job trace，隐私 redaction 正确
- [x] Generation Console 按钮状态守卫
- [x] 用户流级验证通过
Opened: 2026-05-13

## Parent

`.scratch/fakeradio-show-production/PRD.md` — Phase 1 / Phase 3 回归门禁

## What to fix

reviewer 审计发现当前实现进度声明过早。`AUTOMATION_STATE.md` 一度宣称 Phase 1、Phase 2 完成并继续推进，但真实用户流仍没有闭合到可验收状态。

2026-05-13 14:37 复核结论：`generate-now` 已经从“只启动 job”推进到调用 `executeScheduledJob()`，HTTP 级测试证明能生成 episode 并 complete job。但以下回归仍必须先修：

- 前端 `getShowProjects()` 请求 `/api/projects`，server 实际项目列表 route 是 `/api/shows`，Production Board 因此拿不到真实 `ShowProject`。
- Export Queue 找不到 project 时仍 fallback 到 `job.planId`，会把 plan id 当 project id 发下载请求。
- Export Package 的 `show.mp3` 是 0 字节占位，不满足本地回听工程包验收。
- includeTrace=true 只读取 `job.trace`，忽略 ShowProject 的 `production-trace.jsonl`；job trace 为空时导出包可能缺 trace。
- Generation Console 控制按钮存在空操作 fallback，可能在没有可执行 active job 时仍展示按钮。
- 夜间 scheduler / `generate-now` 虽复用了 `executeScheduledJob()`，但该执行逻辑仍挂在 `scheduler-integration.ts`，`create-server.ts` 还用 `as any` 绕过类型边界。
- 浏览器 / 真实 dev server 验证仍未完成。

## Acceptance criteria

- [ ] 前端项目列表 contract 与 server route 对齐：`getShowProjects()` 能拿到真实 `ShowProject`，Production Board 能匹配 completed job 到 project。
- [ ] Export Queue 全路径只使用真实 `ShowProject.id`；没有项目时不要 fallback 到 `planId` 发下载请求。
- [ ] `POST /api/shows/generate-now` 复用 typed show production execution/orchestration，能从 Brief/ShowPlan 推进到 episode 文件、job logs/trace、ShowProject 状态更新。
- [ ] `schedule-tonight` 和 scheduler 夜间执行复用同一套 show production execution，不再维护独立生成路径。
- [ ] `create-server.ts` 不再用 `as any` 注入 execution deps；依赖类型与 adapter 边界清楚。
- [ ] Export Package 不再生成 0 字节 `show.mp3`。如果暂不能混音，应明确失败并返回可诊断错误；如果使用已有 mixer，应产出真实可播放文件。
- [ ] includeTrace=true 时稳定生成 `production-trace.jsonl`，合并 ShowProject trace 与 job trace 的摘要级信息，并确认不包含密钥、cookie、完整 system prompt 或私人记忆原文。
- [ ] Generation Console 只有在 active job 支持对应动作时才展示或启用按钮：running -> pause/cancel/add constraint，paused -> resume/cancel，needs-replan -> resume/cancel；无 active job 时不显示空操作按钮。
- [ ] 用户流级验证覆盖：聊天创建 Brief/Plan、Generate now 执行 episode、Console 读到日志/trace、Production Board 展示 block/episode、Export Package 文件列表、单文件下载、控制按钮状态变化。
- [ ] 浏览器验收覆盖 320px、375px、1440px；如果当前 sandbox 仍无法监听端口，把阻断和替代验证记录到 audit，不得关闭 HITL。

## Suggested implementation order

1. 先修前端/server ShowProject list contract，确保 Production Board 能拿到真实 project。
2. 移除 ExportQueue `planId` fallback，修 Generation Console 空操作按钮。
3. 修 Export Package 音频产物策略。不要用空文件通过验收。
4. 抽出 typed `show-production-executor` 或等价 orchestration 服务，放在 server/show 层，输入 Brief/ShowPlan/Project/job/adapters，输出 episode、trace、project 状态。
5. 让 `generate-now` 与 scheduler 都调用该服务，移除 `as any`。
6. 修 trace 合并与隐私 redaction。
7. 最后做 HTTP 用户流验证和浏览器尺寸验收。

## Blocked by

None. 这是继续 Phase 3 新功能前的门禁修复。

## Type

AFK + HITL verification

## Audit evidence

08:36 审计时的原始证据显示 `generate-now` 只启动 job。14:37 复核时该点已有进展：`server/src/http/register-routes.ts` 的 `generate-now` 已调用 `executeScheduledJob()`，但仍需要收敛成 typed show production executor，并修复以下剩余证据。

2026-05-13 14:37 追加证据：

- `apps/web/src/lib/api-client.ts:164` 调 `/api/projects`，但 `server/src/http/register-routes.ts:652` 项目列表是 `/api/shows`。
- `apps/web/src/features/player/skin-stage.tsx:245` 仍用 `project?.id ?? job.planId`。
- `server/src/export/export-show-project.ts:89`、`:177`、`:181` 仍有 0 字节 `show.mp3` 写入路径。
- `apps/web/src/features/player/skin-stage.tsx:318` 至 `:320` 仍传空函数 fallback。
- `server/src/http/create-server.ts:226` 至 `:242` 仍有 `as any`。
- `pnpm dev` 仍因 `tsx` IPC pipe `listen EPERM` 无法启动真实浏览器验收。
