# 02 ShowPlan 故事线草稿与版本化

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

基于 `ProgramBrief` 生成故事驱动的 `ShowPlan draft`，并支持关键修改产生新版本。ShowPlan 应表达一期节目的叙事线，而不是简单排歌表。Theme Story Show 默认生成 4-8 个 block，block role 来自 PRD 中的有限集合。

## Acceptance criteria

- [ ] shared contract 中定义并测试 `ShowPlan`、`ShowPlanBlock`、`ShowPlanVersion` schema。
- [ ] server 能为指定 Brief 生成 `ShowPlan v1`，并保存版本。
- [ ] block role 只能使用 `opening`、`origin`、`turning-point`、`signature-era`、`relationship`、`influence`、`contrast`、`personal-anchor`、`closing`。
- [ ] 用户追加约束时生成新版本，不覆盖旧版本。
- [ ] 最新版本被标记为 active，旧版本可在 trace / API 中查询。
- [ ] 如果约束改变会影响已生成 episode，计划状态能标记为 `needs-replan`。

## Blocked by

- `.scratch/fakeradio-show-production/issues/01-program-brief-intent-contract.md`

## Type

AFK

## Comments

ShowPlan 是故事线脚本大纲。LLM 可以组织叙事，但事实性背景必须在后续 research / sources 中被支撑。

