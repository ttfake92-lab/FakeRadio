# A-10 音频混音引擎 — TTS + 压低配乐 + 完整歌曲

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

为每首「有互动」的歌生成一段电台感的完整音频：

1. DJ 口播 TTS 音频（已有）
2. 同时播放歌曲音频但音量压低（作为配乐垫底）
3. TTS 结束后歌曲音量渐强至正常
4. 完整歌曲播放至结尾

使用 FFmpeg 实现混音，输出为单个音频文件（`.mp3` 或 `.aac`）。

## Acceptance criteria

- [ ] `server/src/export/audio-mixer.ts` — 接受 `{ ttsPath, musicPath, outputPath }` 生成混音文件
- [ ] 混音参数：TTS 期间音乐音量为 30%，TTS 结束后 3 秒内渐强至 100%
- [ ] FFmpeg 作为外部依赖，服务启动时检查是否可用，不可用时 `/api/export` 返回明确错误
- [ ] 输出文件格式为 `.mp3`，比特率 192kbps
- [ ] 混音过程异步执行，有进度回调（供后续导出 UI 展示进度）
- [ ] 测试：使用真实的静音 WAV 文件验证 FFmpeg 命令结构正确

## Blocked by

- A-09 播放时服务端录制音频流（需要本地 musicPath）
