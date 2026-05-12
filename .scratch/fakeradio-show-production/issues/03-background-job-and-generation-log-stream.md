# 03 生成后台任务与实时日志流

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

为 Show 生成建立后台 job 模型，并提供以日志流为主、结构化时间线为辅的生成控制台数据源。第一版支持启动、查询、暂停、取消、追加约束。日志分为制作台日志和技术栈 trace 摘要。

## Acceptance criteria

- [ ] server 提供启动生成任务的 API，返回 `jobId`，不在单个 HTTP 请求中阻塞完整生成。
- [ ] job 状态至少包含 `pending`、`running`、`paused`、`needs-replan`、`cancelled`、`failed`、`completed`。
- [ ] job 记录制作台日志，例如 Brief 解析、ShowPlan 生成、资料研究、选歌、脚本、TTS、音频、导出。
- [ ] job 记录摘要级技术 trace，例如 adapter、provider、cache、耗时、fallback、错误摘要。
- [ ] trace 不展示密钥、cookie、完整 system prompt、完整私人记忆原文。
- [ ] 第一版支持暂停、取消、追加约束，并有测试覆盖状态转移。

## Blocked by

- `.scratch/fakeradio-show-production/issues/01-program-brief-intent-contract.md`
- `.scratch/fakeradio-show-production/issues/02-showplan-versioned-draft.md`

## Type

AFK

## Comments

这是 `Generate now` 和 `Schedule tonight` 复用的执行基础。UI 可以后续接入，但本 slice 必须先保证 job 与日志数据可查询、可测试。

