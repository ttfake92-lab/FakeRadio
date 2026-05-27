# 让 LLM 对候选集 rerank 并输出可解释选择

Status: completed
Type: AFK

## What to build

把 LLM 从“生成搜索 query 的主决策者”调整为“对真实候选集做 rerank 和解释的 DJ brain”。server 先提供候选歌曲、来源、当前时段、用户品味和近期播放，LLM 在这些候选里选择下一首并输出选择理由。

## Acceptance criteria

- [ ] DJ brain 的输入包含候选曲目列表、候选来源、当前 daypart、用户品味和近期播放。
- [ ] LLM 输出必须选择候选集中的曲目，不能返回候选外的歌曲 ID。
- [ ] LLM 输出包含面向用户的简短解释和面向诊断的选择理由。
- [ ] LLM 输出无效、超时或选择候选外歌曲时，server 有确定性 fallback。
- [ ] 测试覆盖合法 rerank、候选外选择、空候选和 fallback 文案 grounding。

## Blocked by

- `04-favorite-backed-candidate-selection.md`

## Comments

本切片保留现有 adapter 边界；LLM 不直接访问网易云 provider。
