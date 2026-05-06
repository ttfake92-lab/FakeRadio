# 21 修复 mock TTS WAV 内容以 .mp3 扩展名服务导致 MIME 不匹配

Status: needs-triage
Type: bug

## Parent

- 代码审查（2026-05-04）：`FakeRadio/server/src/adapters/tts/mock-tts-adapter.ts:50`

## What to build

Mock TTS adapter 生成真实的 WAV 静音音频（正确），但将其写入 `.mp3` 扩展名的文件，并返回 `.mp3` 结尾的 URL。

服务端 `/cache/tts/*` 路由按扩展名判断 MIME 类型：
```typescript
const mimeType = filePath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
```

结果：用 `audio/mpeg` 的 Content-Type 服务 WAV 字节内容。多数浏览器会嗅探 RIFF 头正常播放，但这是错误行为，严格客户端可能拒绝。

修复：将 mock TTS 的文件扩展名改为 `.wav`，URL 也对应改为 `.wav`。

## Acceptance criteria

- [ ] mock TTS 生成的缓存文件使用 `.wav` 扩展名
- [ ] 返回的 `audioUrl` 指向 `.wav` 路径
- [ ] `/cache/tts/*` 路由为 mock TTS 音频返回 `Content-Type: audio/wav`
- [ ] 现有播放功能不受影响，测试通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
# 确认 mock TTS 测试中 audioUrl 以 .wav 结尾
```
