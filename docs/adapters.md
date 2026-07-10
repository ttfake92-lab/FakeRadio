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

> **踩坑**：`/simi/song` 端点返回的是**老版字段** `artists / album / duration`，而 `/cloudsearch` 等用紧凑字段 `ar / al / dt`。`mapSongToTrack` 必须同时支持两套字段，否则所有"相似歌"的 `artist` 会变成 `Unknown Artist`，LLM 据此生成的口播文案会胡说。详见 `local-runbook.md` 踩坑 #1。

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

TTS 通过 `TtsAdapter` 边界接入。当前支持三种 provider：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| Grok TTS | `FAKERADIO_TTS_PROVIDER=grok`（默认） | 调用 xAI `POST /v1/tts`，返回原始 MP3 bytes |
| MiMo V2.5 TTS | `FAKERADIO_TTS_PROVIDER=mimo` | 小米 MiMo 开放平台语音合成 |
| Fish Audio | `FAKERADIO_TTS_PROVIDER=fish` | 调用 `api.fish.audio POST /v1/tts`，音色用 Voice ID（`reference_id`）指定 |

> **境内网络**：Grok TTS 默认在境内不可达（`api.x.ai` 解析到 Meta CDN IP，被 GFW 阻断）。Node 的 `fetch` 不像 curl 会自动读 `HTTPS_PROXY`，**必须显式配代理**。Grok adapter 自动读 `.env` 的 `HTTPS_PROXY=http://...` 字段并通过 `undici.ProxyAgent` 走代理。无代理时听到的是 macOS 系统声（`synthesizeWithFallback` 兜底）。详见 `local-runbook.md` 踩坑 #5/#6。

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

### Fish Audio TTS 配置（2026-07-10 起）

```bash
FAKERADIO_TTS_PROVIDER=fish
FAKERADIO_FISH_API_KEY=your_fish_key
# 可选覆盖（默认值已内置）
FAKERADIO_FISH_BASE_URL=https://api.fish.audio
FAKERADIO_FISH_TTS_MODEL=s2-pro        # 也可 s1 / s2.1-pro-free 等，作为 model header 传给 API
FAKERADIO_FISH_TTS_TIMEOUT_MS=60000
FAKERADIO_FISH_HTTPS_PROXY=            # 专用代理，不填则按 HTTPS_PROXY → HTTP_PROXY → ALL_PROXY 探测
```

Fish 没有预置音色列表：音色是 fish.audio 音色页面复制的 **Voice ID**（API 的 `reference_id`），在设置页 provider 切到 Fish Audio 后的 Voice ID 文本框填入（存 settings 的 `fishVoiceId`）。请求以 `model` header 指定模型，输出 mp3。播报风格走 s2-pro 的自由文本 bracket 标签（`[温柔治愈] 口播文本`），语速映射到 `prosody.speed`（0.5–2）。代理策略与 Grok 相同（undici `ProxyAgent`）。

> **前端保护**：设置页切到 Fish 但 Voice ID 还没填时，前端只保留本地状态、**不推服务端**（提示「填入 Voice ID 后设置才会生效」），避免服务端进入 "fish + 空 ID" 的 disabled 过渡态。

### 运行时音色 / 风格 / 语速

除环境变量默认值外，音色、播报风格、语速可在运行时通过设置页（`GET/PUT /api/settings`）调整，`applySettings` 重建 adapter，无需重启：

- `ttsVoice` / `mimoVoice` / `fishVoiceId`：音色，按当前 provider 生效（Fish 是自由填写的 Voice ID，不是下拉）。
- `ttsStyle`：播报风格。MiMo 使用中文自由文本注入 user message；Grok 使用官方 speech tag 风格下拉（空串表示自然）；Fish 使用自由文本 bracket 标签前缀。
- `ttsRate`：语速偏移百分比（设置页 -30~50，0 为正常）。Grok 转换为 xAI `speed`（0.7~1.5），Fish 转换为 `prosody.speed`（0.5~2）。MiMo 未确认支持结构化语速参数，改用 `ttsStyle` 文本暗示（如「语速稍慢」）。

缓存键纳入 provider/model/voice/style(或 rate)/text，同文案不同参数不会复用缓存。设置页提供试听按钮（`POST /api/tts/preview`），用当前表单值临时合成一句示例音频。

### 回退策略（2026-07-10 起区分路径）

- **live 播放路径**（`/api/next`、`/api/episode/next` live 生成、聊天口播）：真实 TTS 失败时 `synthesizeWithFallback` 单次回退到 macOS `say`（本地可听 TTS），电台不断播。回退结果仍写入当前 DJ 状态，`fallbackReason` 记录原因。
- **持久化路径**（后台预热 `runPrewarmForDate`、主题节目生成 `scheduler-integration`）：通过 `ComposeEpisodeDeps.audibleTtsFallback: false` **禁用** say 兜底——TTS 失败直接让该次生成失败（prepared episode 记 `failed`，show block 记 error），等下次补生成。否则设置切换的过渡窗口（如 provider 已切 Fish 但 Voice ID 未填）会把系统 say 音频永久烘进 prepared episodes，用户之后播放命中就是"系统音"。

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

LLM 接收 6 类 ContextFragment（system、user、environment、memory、request、execution），输出符合 `DjDecisionSchema` 的 JSON。system prompt 从 `prompts/dj-persona.md` 读取（`create-server.loadSystemPrompt`，候选路径为仓库根 + `process.cwd()`——2026-07-08 前该路径少算一层导致人设从未加载）。用户在 DJ 人设面板保存的自定义覆盖（名字/人设/回复方式/语气）由 `server/src/user/dj-persona-store.ts` 单例持有，在 `buildContextWindow` 组装 system fragment 时统一追加，编辑即时生效。

`LlmAdapter` 接口有三个方法：

- `compute(fragments)` — 输入 context fragments，输出结构化 `DjDecision`（JSON mode）
- `computeRaw(fragments)` — 输入 context fragments，输出原始文本
- `computeJson<T>(systemPrompt, userPrompt)` — 通用 JSON 结构化输出，用于节目计划生成、意图检测等非 DJ 决策场景。使用 `response_format: { type: "json_object" }`，返回泛型 `T`

## Weather adapter

Weather 通过 `WeatherAdapter` 边界接入。当前支持三种 provider（2026-07-08 起天气开箱即用，不再默认 disabled）：

| Provider | 触发条件 | 说明 |
|----------|----------|------|
| Open-Meteo | 默认（无需任何 key） | `open-meteo-weather-adapter.ts`：免费 API，城市名一次地理编码后缓存坐标，WMO weather code 映射为中文天气描述 + mood hint |
| OpenWeatherMap | 有 `FAKERADIO_OPENWEATHER_API_KEY` | OpenWeatherMap Current Weather API |
| Disabled | `FAKERADIO_WEATHER_PROVIDER=disabled` | 单测专用（vitest 配置里已设置，避免单测打真实网络） |

### 配置

```bash
FAKERADIO_WEATHER_PROVIDER=auto   # auto | open-meteo | openweathermap | disabled
FAKERADIO_WEATHER_CITY=Shanghai   # 默认 Shanghai，支持中文城市名
FAKERADIO_OPENWEATHER_API_KEY=    # 可选；auto 模式下有 key 用 OpenWeatherMap，否则 Open-Meteo
```

城市还可以在**运行时**通过设置（`PUT /api/settings` 的 `weatherCity` 字段，入口为个人资料面板）修改，`applySettings` 重建 weather adapter 即时生效；`weatherCity` 为空串时回退环境变量默认值。

输出字段包含天气描述、温度和 mood hint，注入 DJ brain 的 environment context；同时供 `GET /api/weather` 给前端 TopBar 显示「城市 • 天气 温度」。**推荐引擎中天气因子的权重高于每日编排场景词**（详见 `architecture.md` 连续性章节）。

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
