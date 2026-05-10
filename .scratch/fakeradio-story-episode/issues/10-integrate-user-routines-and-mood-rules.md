Status: completed

## Parent

- `.scratch/fakeradio-story-episode/PRD.md`

## What to build

接入 `user/routines.md` 和 `user/mood-rules.md` 到调度与故事生成上下文。

当前 `resolveNextTrackAndDecision()` 中的 `routines` 和 `moodRules` 同样是硬编码字符串，无法反映用户真实的日常节奏（07:00 低刺激启动、21:00 降速）和 mood 规则（晴天/阴雨/连续三首同类后换情绪）。

这个切片需要让 DJ 决策和 story 文案在不同时段、不同天气条件下呈现真实用户定义的风格。

## Acceptance criteria

- [ ] 创建读取 `user/routines.md` 和 `user/mood-rules.md` 的函数，文件缺失时回退到硬编码
- [ ] `resolveNextTrackAndDecision` 中的 `routines` 和 `moodRules` 使用真实文件内容
- [ ] 不同时段（07:00 早晨、09:00 工作、21:00 晚间）生成的 episode story 风格反映真实日程
- [ ] mood-rules（晴天/阴雨/工作时段/连续三首同类）参与 DJ 决策
- [ ] 测试覆盖读取和注入路径
- [ ] 手动验证：不同时段调用 `/api/episode/next`，story 文案风格有可见差异

## Blocked by

None - can start immediately
