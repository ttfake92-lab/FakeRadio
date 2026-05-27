Status: completed

## Parent

- `.scratch/fakeradio-story-episode/PRD.md`

## What to build

接入 `user/taste.md` 到 episode 生成与 DJ 决策上下文。

当前 `resolveNextTrackAndDecision()` 中的 `userTaste` 参数是硬编码字符串（"喜欢低刺激、持续陪伴的音乐"），完全无视 `user/taste.md` 中的真实用户品味。这导致 DJ 口播和故事文案无法体现用户的真实偏好约束（如「避免突然大音量」「口播最多两句话」）。

这个切片需要从文件读取、上下文注入到 API 响应完整打通。

## Acceptance criteria

- [ ] 创建读取 `user/taste.md` 的函数，文件缺失时优雅回退到当前硬编码字符串
- [ ] `resolveNextTrackAndDecision` 中的 `userTaste` 参数使用真实文件内容
- [ ] story composer 的 prompt 中包含 taste 约束（如「避免突然大音量」「口播最多两句话」）
- [ ] `/api/next` 与 `/api/episode/next` 共享同一份 taste 注入
- [ ] 测试覆盖 taste 读取失败回退和成功注入路径
- [ ] 手动验证： episode 的 DJ 口播文案体现用户 taste 中的具体约束

## Blocked by

None - can start immediately
