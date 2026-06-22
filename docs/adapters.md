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
- `recommend({ mood, limit, seeds?, excludeTrackIds? })`
- `resolve(track)`

真实 provider 仍只覆盖这几个能力，不包含歌词、登录态、歌单管理或账号相关逻辑；综合推荐判断不写进 provider，而是由 server 的 Recommendation Engine 完成。

`recommend({ mood, limit, seeds?, excludeTrackIds? })` 接收 Recommendation Engine 生成的策划意图。`mood` 是综合 daypart、天气、日程、品味和 mood rules 后的查询提示；`seeds` 通常来自网易喜欢歌曲，只作为相似推荐种子，不代表要直接播放收藏原曲；`excludeTrackIds` 用于过滤最近播放、当前队列和 seed 原曲。

网易云 adapter 的策略是：有 `seeds` 时优先调用 `/simi/song` 扩展相似歌曲；相似歌曲不足时再用 `mood` 走 `/cloudsearch` 补足候选。

## Provider 选择

music provider 的选择由 `server/src/adapters/music/create-music-adapter.ts` 统一负责，而不是由 route 直接判断。

环境变量：

- `FAKERADIO_PROVIDER_MODE=auto | mock | netease`
- `FAKERADIO_NETEASE_API_BASE_URL`
- `FAKERADIO_NETEASE_TIMEOUT_MS`
- `FAKERADIO_NETEASE_COOKIE_FILE`
- `FAKERADIO_NETEASE_AUDIO_LEVEL=standard | higher | exhigh | lossless | hires`

行为规则：

- `mock`：直接使用 mock，不探测网易云
- `auto`：优先探测本地网易云服务，不可用时自动回退到 mock
- `netease`：显式尝试网易云；若服务不可用，当前版本仍回退到 mock

## 运行时状态

`/api/health` 会暴露当前 music adapter 状态：

- `ready`：当前使用本地网易云 adapter
- `mock`：当前回退到 mock adapter

前端播放器也会直接展示这个状态，并在 `mock` 时给出回退提示。

## 网易云登录与音质

> 截至 2026-05，music.163.com 已封禁网页版二维码登录（返回 code 8821）。FakeRadio 前端已提供 **Cookie 直接注入** 作为替代方案。

播放器页提供“网易云登录”面板，支持两种方式：

**Cookie 直接注入（推荐）**

- `POST /api/netease/login/cookie`：提交完整 cookie 字符串（如 `MUSIC_U=xxx`），直接写入本地存储
- `GET /api/netease/login/status`：查看当前 cookie 登录状态

操作步骤：在浏览器打开 music.163.com 并登录 → F12 → Application → Cookies → music.163.com → 复制 `MUSIC_U` 值 → 在前端「手动注入 Cookie」区域粘贴提交。

**二维码登录（当前不可用）**

- `POST /api/netease/login/qr`：生成二维码
- `GET /api/netease/login/qr/:key`：检查扫码结果（最终会收到 code 8821，无法完成）
- `GET /api/netease/login/status`：查看当前 cookie 登录状态

cookie 默认保存到 `user/secrets/netease-cookie.txt`，该目录不应提交到 git。登录后，`netease-http-music-adapter` 会自动带 cookie 请求网易云，并优先使用 `/song/url/v1` 加 `level` 参数请求更高音质。默认 `level` 是 `exhigh`，可以通过 `FAKERADIO_NETEASE_AUDIO_LEVEL` 调整。

## TTS adapter

TTS 通过 `TtsAdapter` 边界接入。当前支持两种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Grok TTS | `FAKERADIO_TTS_PROVIDER=grok`（默认） | 调用 xAI `POST /v1/tts`，返回原始 MP3 bytes |
| MiMo V2.5 TTS | `FAKERADIO_TTS_PROVIDER=mimo` | 小米 MiMo 开放平台语音合成 |

### Grok TTS 配置

```bash
FAKERADIO_TTS_PROVIDER=grok
FAKERADIO_XAI_API_KEY=your_xai_key
FAKERADIO_XAI_TTS_BASE_URL=https://api.x.ai/v1
FAKERADIO_XAI_TTS_LANGUAGE=zh
FAKERADIO_TTS_VOICE=eve
```

可用官方音色：`eve`、`ara`、`rex`、`sal`、`leo`。Grok 不提供独立 `style` 请求参数，但官方支持 speech tags；设置页会把 Grok 的播报风格下拉映射为 `<soft>`、`<whisper>`、`<emphasis>` 等官方标签并包裹口播文本。

### MiMo TTS 配置

```bash
FAKERADIO_TTS_PROVIDER=mimo
FAKERADIO_MIMO_API_KEY=your_api_key
FAKERADIO_MIMO_BASE_URL=https://api.xiaomimimo.com/v1
FAKERADIO_MIMO_TTS_VOICE=茉莉
```

可用音色：`茉莉`（中文女声）、`冰糖`（中文女声）、`苏打`（中文男声）、`白桦`（中文男声）、`Mia`（英文女声）、`Chloe`（英文女声）、`Milo`（英文男声）、`Dean`（英文男声）、`mimo_default`、`default_zh`、`default_en`。前端通过 `GET /api/tts/voices` 获取下拉列表，无需手填。

### 运行时音色 / 风格 / 语速

除环境变量默认值外，音色、播报风格、语速可在运行时通过设置页（`GET/PUT /api/settings`）调整，`applySettings` 重建 adapter，无需重启：

- `ttsVoice` / `mimoVoice`：音色，按当前 provider 生效。
- `ttsStyle`：播报风格。MiMo 使用中文自由文本注入 user message；Grok 使用官方 speech tag 风格下拉（空串表示自然）。
- `ttsRate`：语速偏移百分比（设置页对 Grok 使用 -30~50，0 为正常），Grok adapter 会转换为 xAI `speed`（0.7~1.5）。MiMo 未确认支持结构化语速参数，改用 `ttsStyle` 文本暗示（如「语速稍慢」）。

缓存键纳入 provider/model/voice/style(或 rate)/text，同文案不同参数不会复用缓存。设置页提供试听按钮（`POST /api/tts/preview`），用当前表单值临时合成一句示例音频。

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

`LlmAdapter` 接口有三个方法：

- `compute(fragments)` — 输入 context fragments，输出结构化 `DjDecision`（JSON mode）
- `computeRaw(fragments)` — 输入 context fragments，输出原始文本
- `computeJson<T>(systemPrompt, userPrompt)` — 通用 JSON 结构化输出，用于节目计划生成、意图检测等非 DJ 决策场景。使用 `response_format: { type: "json_object" }`，返回泛型 `T`

## Weather adapter

Weather 通过 `WeatherAdapter` 边界接入。当前支持两种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Mock | 无 key 时自动使用 | 返回固定天气数据 |
| OpenWeatherMap | `FAKERADIO_OPENWEATHER_API_KEY` | OpenWeatherMap Current Weather API |

### OpenWeatherMap 配置

```bash
FAKERADIO_OPENWEATHER_API_KEY=your_api_key
FAKERADIO_WEATHER_CITY=Beijing
```

auto-detect 逻辑：有 `FAKERADIO_OPENWEATHER_API_KEY` 时自动使用 OpenWeatherMap，否则回退 mock。不需手动设置 provider mode。

输出字段包含天气描述、温度、湿度和 mood hint（如 `warm`、`cool`、`rainy`），注入 DJ brain 的 environment context。

## Calendar adapter

Calendar 通过 `CalendarAdapter` 边界接入。当前支持两种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Mock | 无 key 时自动使用 | 返回固定日程数据 |
| Lark Calendar | `FAKERADIO_LARK_APP_ID` + `FAKERADIO_LARK_APP_SECRET` | 飞书日历 API |

### Lark Calendar 配置

```bash
FAKERADIO_LARK_APP_ID=your_app_id
FAKERADIO_LARK_APP_SECRET=your_app_secret
```

auto-detect 逻辑：有 `FAKERADIO_LARK_APP_ID` 时自动使用 Lark Calendar，否则回退 mock。

输出近期日程上下文，注入 DJ brain 的 environment context 用于感知用户当前时段的忙碌程度。

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
