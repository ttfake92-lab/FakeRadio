# A-08 日终品味推断 — 分析当天对话汇总写回 taste.md

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

用户手动触发「整理今天的品味」（或在「生成今天节目」流程中作为子步骤），Agent 读取当天 session 记录，用 LLM 分析对话中隐含的品味信号（用户反应、忽略、主动收藏等），生成品味更新建议，写回 `taste.md`。

与 A-06（主动修改）的区别：这里处理的是用户没有明确说出来但通过行为隐含的偏好。

## Acceptance criteria

- [ ] `POST /api/taste/infer` 端点：读取当天 session → LLM 分析 → 生成品味摘要 → 合并写回 `taste.md`
- [ ] LLM prompt 包含：今日 session 全量对话 + 收藏记录 + 当前 `taste.md` 内容
- [ ] 推断结果在响应中返回（用户可看到「今天发现你对 X 反应更积极」）
- [ ] 写入前先备份原 `taste.md`（`taste.md.bak`），失败可回滚
- [ ] 如果今日 session 内容太少（少于 3 条 entry），返回「今天互动不够多，暂不更新品味」
- [ ] 测试：mock session 数据 → LLM 调用收到正确 prompt → `taste.md` 被更新

## Blocked by

- A-06 主动品味修改（共用 `taste.md` 写入逻辑）
- A-07 对话会话持久化（数据来源）
