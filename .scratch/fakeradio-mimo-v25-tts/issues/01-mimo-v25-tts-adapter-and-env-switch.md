# MiMo-V2.5-TTS：HTTP adapter + 环境切换

Status: needs-triage

## Parent

- `.scratch/fakeradio-mimo-v25-tts/PRD.md`
- 开发细则：`.scratch/fakeradio-mimo-v25-tts/DEVELOPMENT-GUIDE.md`

## What to build

在同一 `TtsAdapter` 契约下，实现调用 [MiMo V2.5 语音合成](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5) 的服务端适配层；并通过环境变量在 **Edge TTS（现有）与 MiMo（新）** 之间切换。合成结果仍落盘至既有 TTS 缓存目录，`/cache/tts/*` 行为不变。**缓存键必须与 provider、模型、音色参数绑定**，禁止仅按纯文本哈希复用音频。

第一版以实现文档中的 **标准 `mimo-v2.5-tts`** 为主线；VoiceDesign/VoiceClone 可在后续 issue 挂载同一 HTTP 封装。

## Acceptance criteria

- [ ] 新增 MiMo TTS adapter 模块（仅负责「请求开放平台 → 得到音频 bytes → 写缓存」，不做 UI）。
- [ ] `env` 扩展：例如 `FAKERADIO_TTS_PROVIDER`（`edge | mimo`）、`FAKERADIO_MIMO_API_KEY`、`FAKERADIO_MIMO_BASE_URL`、`FAKERADIO_MIMO_TTS_MODEL`（默认值与官方推荐一致或可配置）。
- [ ] `createRadioServer` 按 env 组装对应 TTS adapter；密钥缺失时对 `mimo` 应有明确降级或启动失败语义（需在 PR 中标明并实现测试）。
- [ ] 缓存层：同文案在不同 provider/model/voice 下生成 **不同** 缓存文件或可区分 key。
- [ ] Vitest：对 MiMo adapter 使用 mock HTTP，覆盖成功音频与典型错误。
- [ ] `docs/adapters.md` 增补 MiMo provider 简述（中文）及所需环境变量指向本目录 `DEVELOPMENT-GUIDE.md`。
- [ ] （建议同期）`/api/health` 的 `tts` 状态与实际 provider 对齐，而非隐式假定。

## Blocked by

None - can start immediately

## Type

AFK（实现细节以控制台文档为准，无需额外架构会）
