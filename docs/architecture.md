# FakeRadio 架构

FakeRadio 由四层组成：

1. 外部上下文：用户语料、LLM、音乐 provider、TTS、天气、日历、UPnP。
2. 本地大脑：intent router、context builder、DJ brain、scheduler、TTS cache、state。
3. 运行时 context window：system prompt、用户语料、环境注入、记忆、输入和工具结果、执行轨迹。
4. 交互层：Next.js PWA、HTTP contract、WebSocket stream、单一 audio 元素。

前端永远不直接调用外部服务，只连接本地 server。server 通过 adapter 管理外部能力。

## 当前主链路

当前最完整的一条运行链路是：

1. 前端调用 `GET /api/next`
2. server 收集天气、日历、设备和近期播放记忆
3. DJ brain 先生成一个 draft 选歌 query
4. music adapter 用该 query 搜索候选曲目，并解析出最终可播放 `audioUrl`
5. server 把真实曲目、provider 状态和当前队列再次注入 DJ brain，生成 grounded 文案
6. TTS adapter 生成口播音频路径
7. server 更新当前播放状态、追加播放记忆，并通过 `/stream` 广播
8. 前端刷新当前曲目、队列、DJ 口播和诊断状态

## 真实音乐来源与回退

当前 music provider 有两层：

- `mock music adapter`
- 本地 `NeteaseCloudMusicApi` HTTP adapter

provider 选择由 `server/src/adapters/music/create-music-adapter.ts` 统一处理：

- `mock`：直接走 mock
- `auto`：优先探测本地网易云，失败回退 mock
- `netease`：显式尝试网易云；当前版本不可用时仍回退 mock

这个选择结果会同时影响：

- `/api/health` 的 `adapters.music`
- `/api/next` 的真实歌曲来源
- 前端播放器的 provider 提示和回退警告

## 连续性与 daypart

FakeRadio 当前已经有最小连续性闭环：

- `buildTodayPlan()` 生成当天的时段计划
- `getCurrentPlanBlock()` 选出当前时段 block
- 初始队列按当前 block 的 `moodHint` 生成
- 每次成功生成下一首后，server 追加 `playedTrack` 记忆
- 后续 DJ 文案可引用上一首歌，形成连续过渡

当前 daypart block 包括：

- `07:00` 早晨轻启动
- `09:00` 写代码专注
- `21:00` 晚间降速

## 播放器观测面

PWA 目前不是纯展示壳，而是本地运行态面板。它直接展示：

- 当前播放状态
- stream 连接状态
- 当前 music provider 状态
- 当前曲目与队列来源
- mock 回退提示
- 今日计划与最新 `/api/next` 决策结果
