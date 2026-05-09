# A-07 对话会话持久化 — 保存当天聊天记录供导出使用

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

把当天的 Agent 对话（用户输入、Agent 回复、故事内容、关联 trackId）持久化到本地文件，作为日终品味推断（A-08）和导出节目（A-11、A-12）的数据来源。

每天一个 session 文件（`sessions/YYYY-MM-DD.json`），追加写入，不覆盖历史。

## Acceptance criteria

- [ ] `server/src/user/session-repository.ts` 支持：`appendMessage(entry)`、`getToday()`、`getByDate(date)`
- [ ] Session entry 包含：`timestamp`、`role`（user/agent）、`text`、`trackId?`、`storyType?`（background/personal-memory/mood-reading）
- [ ] 每次 `POST /api/chat` 成功后，用户输入和 Agent 回复都追加到当天 session
- [ ] 故事生成（A-04、A-05）产生的内容也记录到 session，关联对应 trackId
- [ ] Session 文件存储在 `user/sessions/YYYY-MM-DD.json`
- [ ] 测试覆盖：追加写入、按日期读取、多条 entry 的结构

## Blocked by

None — can start immediately
