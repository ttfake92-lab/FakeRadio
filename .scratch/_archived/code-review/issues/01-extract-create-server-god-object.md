# 01 拆分 create-server.ts God Object

Status: ready-for-agent
Type: refactor

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

`create-server.ts` 当前约 350 行，同时承担了 adapter 初始化、播放状态管理（`currentTrack`、`currentDj`、`recentlySelectedTrackIds`、`queue`）、路由注册、WebSocket 广播和 episode 生成逻辑。多个可变 `let` 变量散布在闭包中，使得代码难以推理和单独测试。

建议拆分为以下模块：

1. **`PlaybackState`** — 封装当前播放状态（currentTrack、currentDj、recentlySelectedTrackIds、queue），提供 `rememberSelectedTrack()`、`selectCandidate()`、`buildNowResponse()` 等方法。
2. **`createEpisodeRunner(adapters, state)`** — 提取 `resolveNextTrackAndDecision()` 和 `synthesizeWithFallback()` 逻辑。
3. **`registerRoutes(app, state, adapters, stream)`** — 路由注册层，只做 HTTP 适配，不包含业务逻辑。

## Acceptance criteria

- [ ] `create-server.ts` 缩减到 100 行以内，只做 adapter 创建、状态组装和路由注册的编排
- [ ] 播放状态（currentTrack、dj、recentlySelectedTrackIds、queue）封装为独立对象
- [ ] `resolveNextTrackAndDecision` 和 `synthesizeWithFallback` 提取到独立模块
- [ ] 所有现有测试继续通过（205 个测试）
- [ ] 新增对 `PlaybackState` 的独立单元测试

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
pnpm run typecheck
```

## Comments

- 参考 `CONTEXT.md` 中的架构分层约束：intent router、context builder、DJ brain、scheduler、state、tts 和 realtime 各自承担单一职责。
