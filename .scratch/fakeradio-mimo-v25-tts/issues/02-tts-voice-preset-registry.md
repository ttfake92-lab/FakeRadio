# 音色预设清单与解析（MiMo V2.5 + 可选 Edge 映射）

Status: needs-triage

## Parent

- `.scratch/fakeradio-mimo-v25-tts/PRD.md`

## What to build

维护一份 **稳定 id → 开放平台音色/模型参数** 的预设注册表（建议 TypeScript 常量模块 + 单测），使配置与前端只需引用短 id（如 `dj-warm-zh-jasmine`），而不散落在 `.env` 的长字符串里。预设表须以 [官方 v2.5 语音文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5) 为准完成字段对齐；可先交付文档中枚举的 **标准 TTS 预置音色**，再扩展支线模型。

可选：每条预设附带 **近似 Edge Neural voice**，便于未来实现「MiMo 失败降级 Edge」（若 PRD triage 选择该路径）。

## Acceptance criteria

- [ ] 服务端存在单一真相源：`presetId → { mimoModel, mimoVoice, （可选）edgeVoice }`。
- [ ] 环境变量支持：例如 `FAKERADIO_TTS_PRESET` 覆盖「直接写 MiMo voice」的低层配置；优先级与冲突规则写明并测试。
- [ ] TTS 工厂：`createEdgeTtsAdapter` / `createMimo...Adapter`（见 issue `01-*`）接受 **解析后的音色配置** 或惰性解析函数，便于 issue `03-*` 在运行时切换预设。
- [ ] 单测：`resolveTtsPreset('…')` 对未知 id 报错或回退语义明确且无静默错位。
- [ ] `DEVELOPMENT-GUIDE.md` 增加「预设 id 一览」表格（手写维护，并与官方音色表双向链接说明）。

## Blocked by

- `.scratch/fakeradio-mimo-v25-tts/issues/01-mimo-v25-tts-adapter-and-env-switch.md`

## Type

AFK
