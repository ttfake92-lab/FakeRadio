# 06 TTS 与口播闭环

Status: done
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

把 DJ 口播文案、TTS 合成、缓存路径和播放器消费串成一条完整闭环，让用户看到的 DJ 文案和实际听到的口播保持一致。

完成后，FakeRadio 的 DJ 不再只是文本层的解释，而是一条稳定的音频口播链路，可以与当前播放状态同步存在。

## Acceptance criteria

- [ ] DJ 文案生成后能够可靠地产生可播放的 TTS 结果或稳定回退路径
- [ ] 当前播放状态、DJ 文案和 TTS 结果在 `/api/now` 或等价运行态中保持一致
- [ ] 口播缓存与播放链路的行为可验证，不依赖人工目测代码内部实现

## Blocked by

- `.scratch/fakeradio-v1/issues/03-dj-real-track-grounding.md`

## Comments

- 这条 slice 的重点是“同一条口播链路的连续性”，而不是先接更多 TTS provider。
- 2026-05-01 implementation update:
  - 真实 TTS provider 运行时失败时，`/api/next` 会回退到 mock TTS。
  - `/api/next` 与 `/api/now` 中的 DJ 文案和 TTS 音频路径保持一致。
  - 已用 failing TTS adapter 覆盖 server 测试，`pnpm test` 通过。
