# FakeRadio Show Production - 自动化状态

> **最后更新: 2026-05-14 项目状态检查完成，开发服务器正在运行**

## Current Phase

**Phase 1-4 主线实现已提交，Issue 12 已关闭（HITL 验收除外）**

## Current Active Task

**Next Action 锚点（续跑用）：**
等待用户本地浏览器验收（HITL）：320px / 375px / 1440px 的 Production Board、Generation Console、Export Queue 验证。

## Current Active Issue

暂无（Issue 12 代码实现已提交，剩余浏览器验收为 HITL blocker）

## Done Log

### Phase 1-4 主线（实现已提交）
- [x] ProgramBrief contract + intent parsing
- [x] ShowPlan versioning 初始实现
- [x] Background job + generation logs
- [x] Theme research + story selection
- [x] ShowProject storage
- [x] Generate now + Schedule tonight
- [x] Collapsible UI panels
- [x] Export Package

### Issue 09: Phase 1 制作流回归修复 ✅
- [x] `JobRegistry.updateJob()` 支持非 status 字段更新 (`requireStatusChange=false`)
- [x] `addLog/addTrace` 持久化到数据库
- [x] 前端/后端 ShowProject contract 统一 (`/api/shows`)
- [x] ExportQueue 移除 `planId` fallback
- [x] Export Package `show.mp3` fast-fail 策略
- [x] `show-notes.md` 从 ShowProject 目录读取
- [x] trace 合并与隐私 redaction
- [x] Generation Console 状态守卫

### Issue 10: Show Production 审计回归修复 ✅
- [x] `getShowProjects()` 调用 `/api/shows`，Production Board 拿到真实 ShowProject
- [x] ExportQueue 只使用真实 `projectId`，无 fallback
- [x] `generate-now` 完整 orchestration，HTTP 测试曾验证通过
- [x] `schedule-tonight` 和 scheduler 复用同一套执行路径
- [x] `create-server.ts` 移除 `as any`
- [x] Export Package 音频失败 fast-fail，不再生成 0 字节文件
- [x] trace 合并 ShowProject trace 与 job trace

### Issue 11: 完成声明后的审计回归修复 ✅
- [x] `gatherEpisodeSources()` 默认不再创建真实 public metadata / web research provider
- [x] `ProgramBriefStatusSchema` 新增 `failed` 状态
- [x] `executeScheduledJob()` 成功时将 brief 标记为 `completed`，失败时标记为 `failed`
- [x] `generate-now` API 在开始执行时标记为 `generating`，失败时标记为 `failed`

### Issue 12: Contract、版本化与验收回归修复 ✅（代码已提交）
- [x] 修 `GET /api/plans?briefId=...`：支持 briefId 查询参数，避免前端拿到全局 plans
- [x] 修 `GET /api/jobs?briefId=...`：支持 briefId 查询参数，避免前端拿到全局 jobs
- [x] 修 `ShowPlanGenerator.generateFromPlan()`：追加约束生成同一 `ShowPlan.id` 的新 version，旧 active version 由 repo 自动失活
- [x] 修复相关测试，验证版本化语义正确
- [x] 统一 `generate-now` 与 scheduler 的默认 adapter 策略
- [x] 运行完整测试套件：555/555 测试通过
- [x] typecheck 通过
- [x] 整理工作区并提交代码变更
- [ ] HTTP / 浏览器验收验证（HITL，用户本地执行）

### 本次工作区整理 ✅
- [x] 检查 git status 确认 dirty 状态
- [x] 运行完整测试：555/555 测试通过
- [x] 运行 typecheck：通过
- [x] 更新 AUTOMATION_STATE.md
- [x] 提交所有变更

### 2026-05-14 项目状态检查 ✅
- [x] 验证 git status：工作区干净，本地领先 origin/main 一个 commit
- [x] 运行完整测试：555/555 测试通过
- [x] 运行 typecheck：通过
- [x] 发现端口 3302 已被占用，开发服务器可能已在运行
- [x] 更新 AUTOMATION_STATE.md

## Last Known Verification

### 2026-05-14 项目状态检查

```
pnpm test: 555/555 passed
pnpm typecheck: 通过
git status: working tree clean
端口 3302: 开发服务器正在运行（进程ID: 1041, 1192, 71534）
验证内容：
- 所有测试通过，包括 Phase 1-4 主线功能和 Issue 09-12 的修复
- 所有类型检查通过
- 工作区干净，已提交最新变更
- 开发服务器正在运行，可进行浏览器验收
```

## Next Action

下一轮由用户选择：
选项 1: 本地执行浏览器验收（HITL）：
1. 开发服务器已在 http://localhost:3302 运行
2. 验证 320px / 375px / 1440px 三种视图下：
   - Production Board 可折叠，正确展示 show -> block -> episode
   - Generation Console 可展开，显示日志流和控制按钮
   - Export Queue 可折叠，显示下载入口

选项 2: 跳过浏览器验收，直接推进 Phase 2/3 的后续功能开发

## Blockers

- **浏览器验收受限（HITL blocked）：** 需要用户本地完成 320px / 375px / 1440px 的 Production Board、Generation Console、Export Queue 验收。

## 修改的文件（已提交）

- `.scratch/fakeradio-show-production/AUTOMATION_STATE.md`
- `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`
- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`
- `.scratch/fakeradio-show-production/issues/04-theme-research-and-story-selection.md`
- `.scratch/fakeradio-show-production/issues/07-collapsible-production-board-and-console-ui.md`
- `.scratch/fakeradio-show-production/issues/08-export-package-with-plan-and-trace.md`
- `.scratch/fakeradio-show-production/issues/11-post-completion-audit-regressions.md`
- `.scratch/fakeradio-show-production/issues/12-contract-versioning-and-verification-regressions.md`
- `.scratch/fakeradio-show-production/issues/p2-01-scheduler-consume-scheduled-brief.md`
- `.scratch/fakeradio-show-production/audits/2026-05-14-0240-audit.md`
- `packages/shared/src/contracts/radio.ts`
- `server/src/http/create-server.test.ts`
- `server/src/http/create-server.ts`
- `server/src/http/episode-runner.ts`
- `server/src/http/register-routes.ts`
- `server/src/show/scheduler-integration.test.ts`
- `server/src/show/scheduler-integration.ts`
- `server/src/show/show-plan-generator.test.ts`
- `server/src/show/show-plan-generator.ts`
