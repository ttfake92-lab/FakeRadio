# 移除 Queue / Tracks / Live 文案噪音

Status: wontfix
Type: AFK
Superseded by: .scratch/glass-radio-console-player-fix/PRD.md and issues 15-19

## What to build

去掉这些不需要的字，把队列和直播状态压缩为更隐性的电台状态。

## Acceptance criteria

- [ ] 删除 `QUEUE` / `TRACKS` 独立 strip 区域。
- [ ] 队列数量以极小标签形式融入底部状态栏或播放区角落。
- [ ] 删除 `LIVE` 文案标签（DJ Room header 中的 `LIVE`）。
- [ ] 删除 `Connected to FakeRadio server` 这条 server-line。
- [ ] 删除 `Now playing: xxx` 这种重复提示（歌曲信息已在播放区展示）。
- [ ] 直播状态通过 ON AIR 呼吸灯和连接状态小字暗示，不再额外标注。

## Blocked by

- 5（重排 Now Playing 信息层级）

## Comments

