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

## TTS adapter

TTS 通过 `TtsAdapter` 边界接入。当前支持两种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Edge TTS | `FAKERADIO_TTS_PROVIDER=edge`（默认） | 使用 `edge-tts` npm 包，Microsoft Edge TTS 服务 |
| MiMo V2.5 TTS | `FAKERADIO_TTS_PROVIDER=mimo` | 小米 MiMo 开放平台语音合成 |

### MiMo TTS 配置

```bash
FAKERADIO_TTS_PROVIDER=mimo
FAKERADIO_MIMO_API_KEY=your_api_key
FAKERADIO_MIMO_BASE_URL=https://api.xiaomimimo.com/v1
FAKERADIO_MIMO_TTS_VOICE=茉莉
```

可用音色：`茉莉`（中文女声）、`冰糖`（中文女声）、`苏打`（中文男声）、`白桦`（中文男声）、`Mia`（英文女声）、`Chloe`（英文女声）、`Milo`（英文男声）、`Dean`（英文男声）、`mimo_default`、`default_zh`、`default_en`。

缓存键与 provider、模型、音色绑定，同文案不同音色不会复用缓存。

### 回退策略

- route 调用选定的 TTS adapter 生成 DJ 口播音频。
- 如果真实 TTS provider 在运行时失败，server 会单次回退到 mock TTS。
- 回退结果仍写入当前 DJ 状态，`/api/now` 与 `/api/next` 中的 DJ 文案和音频路径保持一致。

## LLM adapter

LLM 通过 `LlmAdapter` 边界接入。当前支持两种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Mock | 无 key 时自动使用 | 模板生成固定 DJ 文案 |
| DeepSeek | `FAKERADIO_DEEPSEEK_API_KEY` | DeepSeek API（OpenAI 兼容） |

### DeepSeek 配置

```bash
FAKERADIO_DEEPSEEK_API_KEY=your_api_key
FAKERADIO_DEEPSEEK_MODEL=deepseek-v4-flash
FAKERADIO_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

LLM 接收 6 类 ContextFragment（system、user、environment、memory、request、execution），输出符合 `DjDecisionSchema` 的 JSON。system prompt 从 `prompts/dj-persona.md` 读取。

## StorySourceAdapter

`StorySourceAdapter` 是 DJ 故事 episode 的资料源边界，把歌词、公开元数据和网页研究转换为结构化证据片段 `StorySourceNote[]`。

已接入的资料源：

- **网易云歌词 adapter**（`netease-lyric-adapter.ts`）：通过本地 `NeteaseCloudMusicApi` 获取歌词，返回 `kind: "lyric"` source notes。歌词不可用时返回空数组，不阻断 episode 生成。
- **公开音乐元数据 adapter**（`public-metadata-adapter.ts`）：通过 MusicBrainz API 查询录音信息，返回 `kind: "metadata"` source notes。confidence < 0.5 时返回空数组。
- **网页研究 adapter**（`web-research-adapter.ts`）：通过 Brave Search API 搜索歌曲创作背景、艺人访谈等，返回 `kind: "web"` source notes。未配置 `FAKERADIO_BRAVE_API_KEY` 时自动禁用。
- **Mock adapter**（`mock-story-source-adapter.ts`）：开发与测试用兜底，返回 `kind: "mock"` source notes。

边界规则：

- route 只能消费 `StorySourceAdapter` 输出的 source notes，不能直接写 provider 查询逻辑。
- story composer 只能基于 source notes 讲创作背景。
- 没有可靠 source note（metadata/web confidence >= 0.5）时，只能生成 `lyric-theme` 或 `mood-reading`，不允许编造幕后故事。
- 任何资料源失败或返回空时，episode route 稳定降级到低一级 story type，不阻断 `/api/episode/next`。
