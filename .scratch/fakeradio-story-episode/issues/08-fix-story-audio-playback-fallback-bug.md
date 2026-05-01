## Parent

- `.scratch/fakeradio-story-episode/PRD.md`

## What to build

修复前端 story 口播音频播放失败时自动跳过并只播放音乐的 bug。

当前 `player-shell.tsx` 中 `speechAudio.play()` 被拒绝后（如浏览器自动播放策略、音频加载失败），`.catch()` 块直接启动 `musicAudio`，导致用户完全听不到 DJ 口播，只看到音乐播放。

这个切片需要从前端 audio 元素预加载策略、play() 错误处理、状态机和用户提示四个层面完成修复。

## Acceptance criteria

- [ ] `speechAudio` 在设置 `src` 后主动触发 `load()`，或使用 `preload="auto"` 减少加载失败概率
- [ ] `speechAudio.play()` 被拒绝时，不自动启动 `musicAudio`
- [ ] 播放失败进入 `error` 状态，并给用户明确提示（如「口播加载失败」）
- [ ] 状态机不因 catch 块中的 `setEpisodeState` 异常而错乱
- [ ] 测试覆盖 `SPEECH_ERROR` 路径和错误回退行为
- [ ] 手动验证：播放 episode 时 story 音频先播放，失败时有明确提示而非静默切到音乐

## Blocked by

None - can start immediately
