# FakeRadio Adapter 指南

外部能力必须通过 adapter 接入。

## Adapter 类型

- LLM adapter：输入 context fragments，输出 `DjDecision`。
- Music adapter：搜索、推荐、解析音频 URL、获取歌词。
- TTS adapter：输入 DJ 口播文本，输出缓存音频路径。
- Weather adapter：输入当前环境，输出天气摘要和 mood hint。
- Calendar adapter：输出近期日程上下文。
- Device adapter：输出本地浏览器或 UPnP 设备。

## 当前 provider 策略

FakeRadio 当前仍以 mock 为基础闭环，但 `music adapter` 已支持两种来源，并且已经接到真实运行链路里：

- mock music adapter
- 本地 `NeteaseCloudMusicApi` HTTP adapter

真实 provider 只能替换 adapter，不能绕过 shared contract。

## Music adapter 边界

`MusicAdapter` 当前只负责三件事：

- `search(query)`
- `recommend({ mood, limit })`
- `resolve(track)`

第一版真实网易云接入只覆盖这三个能力，不包含歌词、登录态、歌单管理或账号相关逻辑。

`recommend({ mood, limit })` 的当前策略不是走账号级推荐，而是把 `mood` 当作检索提示词生成候选。这个 `mood` 目前来自 daypart block 的 `moodHint`。

## Provider 选择

music provider 的选择由 `server/src/adapters/music/create-music-adapter.ts` 统一负责，而不是由 route 直接判断。

环境变量：

- `FAKERADIO_PROVIDER_MODE=auto | mock | netease`
- `FAKERADIO_NETEASE_API_BASE_URL`
- `FAKERADIO_NETEASE_TIMEOUT_MS`

行为规则：

- `mock`：直接使用 mock，不探测网易云
- `auto`：优先探测本地网易云服务，不可用时自动回退到 mock
- `netease`：显式尝试网易云；若服务不可用，当前版本仍回退到 mock

## 运行时状态

`/api/health` 会暴露当前 music adapter 状态：

- `ready`：当前使用本地网易云 adapter
- `mock`：当前回退到 mock adapter

前端播放器也会直接展示这个状态，并在 `mock` 时给出回退提示。
