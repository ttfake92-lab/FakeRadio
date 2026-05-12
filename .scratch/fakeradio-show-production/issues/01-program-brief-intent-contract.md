# 01 ProgramBrief 制作意图 contract 与解析入口

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

建立 `ProgramBrief` 作为用户制作意图的持久化 contract，并让聊天入口能区分“制作一期主题节目”“某个时段想听某主题”“普通闲聊 / 品味表达”。完成后，用户说“帮我做一期围绕 Bee Gees 的主题节目”会创建整期主题 Brief；说“今晚想听 Bee Gees 相关的东西”会创建 block 级 Brief；普通表达只进入 memory / taste。

## Acceptance criteria

- [ ] shared contract 中定义并测试 `ProgramBrief` schema，覆盖 `theme-show`、`block-theme`、`daily-show`。
- [ ] server 能持久化 Brief，并通过最小 API 返回当前 Brief 列表与详情。
- [ ] `/api/chat` 或等价 intent 入口能解析明确制作意图并创建 Brief。
- [ ] 弱表达不创建 Brief，只保持现有聊天 / taste / session 语义。
- [ ] Agent 回复包含轻量确认，并提示用户可以继续追加约束。
- [ ] 测试覆盖整期主题、block 主题、闲聊、品味更新四类输入。

## Blocked by

None - can start immediately

## Type

AFK

## Comments

这是新主线的入口 slice。不要在本 slice 中实现 ShowPlan 生成或音频导出，只需要让制作意图成为稳定、可查询、可后续 job 消费的数据。

