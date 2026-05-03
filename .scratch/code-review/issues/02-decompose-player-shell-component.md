# 02 拆分 player-shell.tsx 巨型组件

Status: ready-for-agent
Type: refactor

## Parent

- 代码审查：`FakeRadio/apps/web/src/features/player/player-shell.tsx`

## What to build

`player-shell.tsx` 当前 625 行，混合了状态管理、音频播放逻辑（crossfade、ducking）、WebSocket 处理、事件监听和 UI 渲染。所有 `useState` 堆在一起，事件回调内嵌在组件体中。

建议拆分为：

1. **`usePlaybackState()`** — 自定义 hook，管理 episode 状态机（`episodeState`、`episodeData`、`nextEpisode`、`isPrefetching`）。
2. **`useAudioEngine(musicRef, speechRef)`** — 音频淡入淡出、crossfade、ducking 逻辑。
3. **`useStreamConnection(url)`** — WebSocket 连接管理和事件分发。
4. **`PlayerPanel`、`ChatPanel`、`QueuePanel`、`PlanPanel`、`TastePanel`** — 独立的 UI 子组件。

## Acceptance criteria

- [ ] `player-shell.tsx` 缩减到 150 行以内，只做 hook 组合和布局渲染
- [ ] 音频播放逻辑（fadeVolume、crossfade、ducking）提取到 `useAudioEngine`
- [ ] WebSocket 连接和事件处理提取到 `useStreamConnection`
- [ ] episode 状态机管理提取到 `usePlaybackState`
- [ ] 所有现有前端测试继续通过（70 个 view model 测试 + 6 个 API client 测试）
- [ ] 新增对 `useAudioEngine` 和 `usePlaybackState` 的单元测试

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
pnpm run typecheck
```

## Comments

- `player-view-model.ts` 已经是很好的实践，继续这个方向将逻辑从组件中抽离。
- 注意保持 WebSocket 消息到状态更新的时序不变。
