# 在播放器诊断面板展示推荐链路

Status: completed
Type: AFK

## What to build

在本地 server API 和 PWA 播放器诊断面板中展示本次推荐链路：收藏库是否加载、候选来源、候选数量、最终选择原因、是否 fallback、music 请求是否处于登录态。用户可以据此判断“不准”发生在数据、候选、LLM rerank 还是 provider。

## Acceptance criteria

- [ ] `/api/next` 或相关诊断 API 返回本次推荐链路摘要。
- [ ] PWA 播放器展示候选来源、fallback 状态和最终选择原因。
- [ ] 诊断信息不展示完整收藏库，不泄露 cookie 或敏感账号信息。
- [ ] 当前 provider 为 mock、网易云未登录、收藏库为空时都有明确提示。
- [ ] 前端和 shared contract 测试覆盖新增诊断字段。

## Blocked by

- `04-favorite-backed-candidate-selection.md`
- `05-llm-rerank-grounded-candidates.md`

## Comments

本切片用于缩短后续推荐质量调试反馈回路。
