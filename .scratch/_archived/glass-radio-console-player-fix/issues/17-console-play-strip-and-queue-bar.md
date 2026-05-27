# 重建控制台播放条与 Queue 黑条

Status: ready-for-agent
Type: AFK

## What to build

把当前挤在右侧的小播放控件改成参考图里的横向控制台播放条：左侧频谱 + 曲目信息，中间播放控制，右侧收藏/音量，下方完整进度条。播放条下方新增常驻黑色 `QUEUE / N TRACKS` 分隔栏。

这一步替代旧 issues 04-10 的零碎按钮和进度条任务。

## Acceptance criteria

- [ ] 播放条左侧有低干扰频谱/律动标识，播放时可动，`prefers-reduced-motion` 下停止。
- [ ] 曲目信息显示标题、artist、播放状态；空状态文案不再让布局塌陷。
- [ ] 播放控制集中为一组：上一首、播放/暂停、下一首、收藏；按钮尺寸和形态接近参考图。
- [ ] 音量区显示 `VOL` 和滑杆，位于播放条右侧。
- [ ] 进度条横跨播放条下方，当前时间和总时长分列两端。
- [ ] 新增黑色 `QUEUE` strip，右侧显示队列数量，例如 `0 TRACKS`。
- [ ] 不删除 Queue strip；旧 issue 10 的“移除 Queue / Tracks / Live 文案噪音”被本 issue 取代。

## Blocked by

- `.scratch/glass-radio-console-player-fix/issues/16-claudio-shell-brand-and-clock.md`

