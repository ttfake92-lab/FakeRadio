# 11 TTS 播放失败时恢复音乐音量

Status: ready-for-human
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

当前播放器收到 `dj-speech` 事件时，如果音乐正在播放，会先把音乐音量 duck 到 `0.2`，再调用 `speechAudio.play()`。如果浏览器拒绝自动播放或播放 promise rejected，当前 `.catch(() => {})` 不恢复音量，音乐可能一直保持低音量。

需要在 TTS 播放失败路径恢复音乐音量，并补上前端单测或可维护的行为测试。

## Acceptance criteria

- [ ] `speechAudio.play()` rejected 时调用 `restoreMusicVolume()`
- [ ] 音乐已 duck 但 TTS 无法播放时，最终音量会恢复到正常值
- [ ] 保持 `ended` 和 `error` 事件下的现有恢复行为
- [ ] 新增前端测试覆盖失败恢复路径，或将 ducking 逻辑抽出为可测试 helper

## Blocked by

- None - can start immediately

## Verification

- 2026-05-01 最小确认：`apps/web/src/features/player/player-shell.tsx` 当前仍存在 `speechAudio.play().catch(() => {})`，catch 分支没有恢复音量。
- 2026-05-01 修复后验证：`speechAudio.play().catch()` 已调用 `restoreMusicVolume()`；`pnpm test` 通过，音量 fade helper 有单测覆盖。

## Comments

- 2026-05-01 implementation update:
  - TTS 播放 promise rejected 时会恢复音乐音量。
  - 仍建议后续把 speech playback orchestration 抽成更完整的可测 helper，而不是只测 fade math。
  - 等待人工验收与归档。
