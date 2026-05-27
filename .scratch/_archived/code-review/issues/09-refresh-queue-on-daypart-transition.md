# 09 时段切换时刷新播放队列

Status: ready-for-agent
Type: feature

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

`queue` 在 server 启动时按当前 daypart 的 `moodHint` 生成一次，之后不再更新。如果用户从早上一直运行到晚上，queue 中的内容仍然是早晨的曲风（如 "warm morning indie"）。

建议：

1. 在 `resolveNextTrackAndDecision` 中检查当前时段是否已切换。
2. 当 `getCurrentPlanBlock` 返回的 block 与上次不同时，用新的 `moodHint` 重新生成队列。
3. 广播 `queue-updated` 事件通知前端。

## Acceptance criteria

- [ ] 当 daypart 切换时，队列自动按新 `moodHint` 刷新
- [ ] 队列刷新后广播 `queue-updated` 事件
- [ ] 不影响当前正在播放的曲目
- [ ] 新增测试覆盖时段切换场景

## Blocked by

None — can start immediately

## Verification

手动将系统时间调到不同时段，连续调用 `/api/next`，验证队列内容随时段变化。

## Comments

- 需要在 state 中记录上次刷新队列时的 block 标识。
- 可以在 `PlaybackState` 中增加 `lastPlanBlockAt` 字段。
