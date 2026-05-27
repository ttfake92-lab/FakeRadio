# 07 环境感知编排

Status: done
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

让天气、日历和设备状态作为明确的环境输入进入 context，并对 DJ 决策、选歌与解释产生可见影响。

完成后，FakeRadio 的“个人电台”体验会从只依赖品味和时段，进一步进化为能感知当天环境与设备条件的编排系统。

## Acceptance criteria

- [ ] weather、calendar、device 输入能以稳定的环境片段形式进入上下文，而不是零散散落在 route 里
- [ ] 至少一种环境输入变化能在用户可见行为上体现，例如口播或选歌理由变化
- [ ] 环境感知逻辑仍保持在 adapter + context fragments 的架构边界内

## Blocked by

- `.scratch/fakeradio-v1/issues/05-state-and-daypart-continuity.md`

## Comments

- 这条 slice 关注“环境被感知并影响结果”，不要求第一步就把所有外部 provider 都接成真实来源。
