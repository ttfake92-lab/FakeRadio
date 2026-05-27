# PRD · MiMo-V2.5-TTS 与快速音色预设

## 背景

FakeRadio 当前默认通过 `edge-tts` 合成 DJ 口播与故事音频。用户希望在保持 **adapter 边界** 的前提下接入 [小米 MiMo 开放平台 · 语音合成 v2.5](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5)，使用 **MiMo-V2.5-TTS 系列**（含标准 TTS / VoiceDesign / VoiceClone 等在文档中列出的能力），并提供 **不需手改长篇配置即可切换音色预设** 的体验。

## 目标

1. Server 侧新增 MiMo V2.5 TTS provider，与环境变量配置的 Edge TTS **可切换**。
2. 维护与本项目命名一致的 **音色预设清单**（稳定 id → 文档中的模型与音色参数），默认以 **标准 `mimo-v2.5-tts` 预置音色** 为第一交付范围。
3. 提供本地可用的 **快速设定音色**：用户通过 Web 控件或等价 API 选定预设并持久化，使后续合成走对应音色配置。

## 非目标（首期）

- 不在首批强制实现 VoiceClone 的端到端音频上传链路（可作为后续 issue）。
- 不替代现有 TTS 失败回退语义；具体「MiMo 失败后是否降级 Edge」见 issues 内的产品决策占位。

## 参考

- 官方文档（权威）：https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
- 产品与实现拆分：见 `issues/` 与 `DEVELOPMENT-GUIDE.md`。

## 决策占位（需在 triage 时拍板）

- MiMo 请求失败时的策略：沿用当前「仅 mock 回退」，或增加「再走 Edge」。
- `voiceclone` / `voicedesign` 是否在进入 `ready-for-agent` 前就锁定 schema（建议单独 issue）。
