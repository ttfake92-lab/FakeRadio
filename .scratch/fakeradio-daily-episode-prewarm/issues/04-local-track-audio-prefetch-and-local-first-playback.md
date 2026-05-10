# 04 - 本地歌曲音频预下载与 local-first 播放

Status: needs-triage

## What to build

把歌曲音频预下载纳入第一轮。夜间预热生成 episode 后，server 尝试把对应歌曲音频下载到 `user/audio`；播放时 `/api/audio/:trackId` 优先读取本地文件，缺失或不可读时再代理远端音频，保持现有播放入口不变。

## Acceptance criteria

- [ ] 新增可复用的 track audio recording 函数，能在无 HTTP 客户端请求时下载 `track.audioUrl` 到 `user/audio`。
- [ ] 预热任务在 episode ready 后尝试下载歌曲音频，并把下载状态写入 prepared episode 的可观测轨迹或状态字段。
- [ ] `/api/audio/:trackId` 优先服务本地已录制文件；本地文件缺失时保持现有 proxy-and-record 行为。
- [ ] 本地下载失败不影响 prepared episode ready 状态，但必须在状态接口或轨迹中可见。
- [ ] 测试覆盖本地命中、远端回退、下载失败不阻断预热、content-type 正确返回。

## Blocked by

- `.scratch/fakeradio-daily-episode-prewarm/issues/03-nightly-full-day-episode-prewarmer.md`

## Comments

