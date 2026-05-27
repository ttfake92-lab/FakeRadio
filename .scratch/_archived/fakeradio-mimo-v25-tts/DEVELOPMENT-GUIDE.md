# MiMo-V2.5-TTS 接入 · 开发指南

本文服务于 `.scratch/fakeradio-mimo-v25-tts/` 下的实现 issue，并与 [官方文档 · 语音合成 v2.5](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5) 对齐；**字段名、示例 JSON、错误码与限流均以控制台文档为准**。若抓取工具无法读到页面正文，请在浏览器中打开该链接校对。

---

## 1. 开放平台与密钥

1. 在 **小米 MiMo API 开放平台** 注册并完成控制台流程，创建 **API Key**（或与文档一致的 Bearer Token 形态）。
2. **保管密钥**：仅存环境变量或本机密钥管理工具，不入库、不写进前端 bundle。
3. 文档中的 **Base URL**、路径前缀（常为 OpenAI 兼容形态）以实现时控制台为准；服务端 adapter 建议使用可配置的 `FAKERADIO_MIMO_BASE_URL`。

建议在 `.env.example`（实现阶段）中增加占位键，但不要提交真实密钥。

---

## 2. MiMo-V2.5-TTS 系列模型（语义）

以下为系列级区分，便于与 issue 对齐；**精确模型字符串以官方文档为准**。

| 能力方向 | 典型模型 id（占位） | 说明 |
|---------|---------------------|------|
| 标准预置音色合成 | `mimo-v2.5-tts` | 适合 FakeRadio 第一版：枚举文档中的预置音色 |
| 文本描述音色 | `mimo-v2.5-tts-voicedesign` | 延后 issue |
| 参考音频克隆 | `mimo-v2.5-tts-voiceclone` | 延后 issue |

Rust 示例库 [`mzdk100/mimo`](https://github.com/mzdk100/mimo) 中有与上述 id 一致的用法说明，可作 **非权威** 交叉参考。

---

## 3. HTTP 契约（实现时需对照官方）

开放平台常见模式为：**OpenAI 兼容的 `/v1/chat/completions`**，在请求体中通过扩展字段传入 **文本、音色、音频格式（如 mp3 / wav）、流式或非流式** 等参数。实现步骤建议：

1. 用控制台文档中的最小可运行 `curl` 复现单次成功响应。
2. 将路径、方法与鉴权 header 固化到 **单一 `createMimoTtsHttpClient` 之类的模块**，其余 adapter 不直接拼 URL。
3. 解析响应中的音频 bytes（Base64 decode 或直接 binary，以文档为准），写入 FakeRadio 既有 **TTS 缓存目录**，返回与 `TtsAdapter` 一致的 `{ text, audioUrl, cacheKey }`。

---

## 4. 音色与预设（本项目约定）

官方标准 TTS 常提供多路 **中文/英文/默认** 预置音色。社区资料中出现过与中文相关的命名示例（如「茉莉」「冰糖」），**必须与官方文档中的英文/内部 id 逐项核对后再写入代码常量**。

FakeRadio 内约定：

- **预设 id**：小写短横线，如 `dj-warm-zh-jasmine`、`dj-calm-en-mia`，稳定对外（API、前端、用户文件）。
- **解析结果**：每条预设解析为 `{ model: string, voice: string, ...extensions }`，供 MiMo adapter 组装请求；若保留 Edge，可同时映射近似 `FAKERADIO_TTS_VOICE`（Edge Neural id），便于降级策略扩展。

---

## 5. 缓存键与 provider 切换

当前 `hashText(text)` **未包含音色与 provider**。接入 MiMo 后必须避免「同文案不同音色误用旧缓存」，建议在共享层实现 **`hashTtsPayload({ text, provider, model, voice, presetId })`** 或由 cache manager 接收显式 `cacheKey` 后缀组件。

---

## 6. FakeRadio 代码落点（现状）

| 区域 | 文件/入口 |
|------|-----------|
| 默认 TTS | `createRadioServer` 中 `createEdgeTtsAdapter` |
| Env | `server/src/config/env.ts` |
| 契约 | `TtsAdapter` / `packages/shared` 中 `TtsResult` |

新增 MiMo adapter 后，`createRadioServer` 应根据 env 选择 **Edge / MiMo**，并保持 `synthesizeWithFallback` 仍可回退 mock。

`/api/health` 中的 `tts` 字段语义曾存在与真实 provider 不一致的历史问题（参见 `.scratch/code-review/issues/07-fix-tts-status-in-health.md`）。实现本特性时 **`tts` 应反映当前真实 provider**，避免仍为硬编码推导。

---

## 7. 验证清单

- [ ] 单次合成：服务端日志无密钥泄露，缓存文件可被 `/cache/tts/...` 正确播放。
- [ ] 切换预设：新文案或同文案在不同预设下缓存不串音。
- [ ] 离线/错误：断言回退路径仍返回合法 `audioUrl`，电台主流程不因 TTS 挂死。
- [ ] Vitest：`fetch`/`undici` mock 覆盖成功体、4xx、超时。

---

## 8. 合规与产品说明

MiMo API 计费、配额、可用地区与试用期以官方控制台为准；FakeRadio 为本地优先原型，适配器封装应避免把平台特定错误泄露到前端 PWA。
