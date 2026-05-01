# 05 状态与节律连续性

Status: ready-for-human
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

让 FakeRadio 在一天中的不同时段具备持续性：播放历史、当前计划、daypart 节律和近期偏好可以共同影响后续选歌与解释，而不是每次请求都像重新开始。

完成后，用户会感受到 FakeRadio 有“今天的上下文”和“这个时段的气质”，而不是单次接口驱动的碎片行为。

## Acceptance criteria

- [ ] 系统能保存并消费足以影响连续性的状态信息，例如近期播放、today plan 或等价运行态
- [ ] 早晨、工作时段和晚间在外部可见行为上能表现出不同的节律倾向
- [ ] 状态与节律逻辑仍保持在既定边界内，不把 provider 专有细节引入 state 或 scheduler

## Blocked by

- `.scratch/fakeradio-v1/issues/03-dj-real-track-grounding.md`

## Comments

- 这是从“能选歌”走向“像电台一样有连续性”的核心 slice。
- 2026-04-30 AI triage:
  - Category: enhancement
  - Why now: 真实曲目 grounding 已完成，下一步需要让 queue、today plan 和近期播放历史对行为产生连续影响。
- 2026-04-30 implementation update:
  - server 现在按当前 daypart 的 `moodHint` 初始化队列，不再固定使用单一早晨 mood。
  - `/api/next` 会读取近期播放记忆并写入最新播放，mock DJ 文案可引用上一首歌，形成连续解释。
  - scheduler 新增 `getCurrentPlanBlock`，`/api/plan/today` 与 daypart 逻辑统一基于同一时间源。
  - 对应验收项已满足，等待人工验收与归档。
