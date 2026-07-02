# FakeRadio 上下文

## 项目定位

FakeRadio 是一个本地优先、由大模型驱动的个人音乐电台。

系统目标不是做通用音乐平台，而是围绕一个人的长期品味、日常节奏和即时环境，持续产出“像本地 DJ 一样”的陪伴式播放体验。

当前仓库优先实现以下闭环：

1. PWA 播放器只连接本地 server。
2. 本地 server 负责 orchestration、调度、状态和外部能力接入。
3. 大模型输出结构化 DJ 决策。
4. 音乐、TTS、天气、日历和设备能力都通过 adapter 接口接入。

## 核心术语

### PWA 播放器

用户看到和交互的前端界面，承载播放状态、队列、聊天、品味摘要和今日计划。前端不直接访问外部 provider。

### 本地 server

FakeRadio 的中枢。负责 HTTP API、WebSocket stream、DJ 决策编排、状态读写、调度执行和 adapter 调用。

### DJ brain

把用户语料、环境信息、近期记忆和请求上下文组装后交给大模型，再把模型输出约束为可执行的结构化决策。

### Context fragments

每次生成 DJ 决策时参与拼装的上下文片段，至少包括六类：

1. system prompt
2. 用户语料
3. 环境注入
4. 已检索记忆
5. 用户输入和工具结果
6. 执行轨迹

### Adapter

对外部能力的统一接入层。外部服务不能直接渗透进核心流程，只能通过 adapter interface 暴露能力。

### Scheduler

把“这个时刻应该播放什么样的内容”变成可执行节奏的模块。它关注时间段、日常节奏、计划和 hook，而不是具体 provider 细节。

### State

用于保存近期消息、播放历史、计划、偏好和缓存索引的持久层。它服务于“连续性”，而不是只做一次性请求缓存。

## 领域事实

### 用户品味

- 偏好低刺激、可持续陪伴的音乐。
- 适合写作、编程、阅读时作为背景。
- 早晨偏温暖、轻盈、带一点启动感。
- 晚间偏松弛、空间感、低密度。
- 避免突然大音量进入、过密人声、连续情绪过满。

### DJ 语气

- 简短、自然、有陪伴感。
- 不像营销播报。
- 每次口播最多两句话。
- 优先解释当前时刻为什么适合这首歌。
- 不编造 provider 尚未返回的结果。

### 日常节奏

- 07:00 到 09:00：从低刺激开始，逐步抬升能量。
- 09:00 到 12:00：稳定、少打扰、适合专注。
- 14:00 到 18:00：允许更强节奏，但仍要背景友好。
- 21:00 后：降低能量和语言密度，减少强鼓点。

## 架构边界

### 前端边界

- `apps/web` 只消费本地 HTTP contract 和 WebSocket stream。
- 前端保留单一播放管线，不在浏览器端做 provider 编排。

### 服务端边界

- `server` 负责 orchestration。
- context builder、DJ brain、scheduler、state、tts 和 realtime 各自承担单一职责。
- 真实 provider 的差异由 adapter 吸收，不进入核心策略层。

### 共享 contract 边界

- 前后端共享类型以 `packages/shared` 为准。
- route payload、事件名和结构化 DJ 输出都应先落到 shared contract，再被应用层消费。

## 当前运行时模型

FakeRadio 目前按四层理解：

1. 外部上下文：用户语料、LLM、音乐、TTS、天气、日历、UPnP。
2. 本地大脑：context builder、DJ brain、scheduler、state、tts cache。
3. 运行时 context window：六类 fragments 组装后的 prompt 输入。
4. 交互层：PWA、HTTP contract、WebSocket stream、audio 播放管线。

## 当前已落地能力

### 真实音乐来源

- `music adapter` 已支持 `mock` 和本地 `NeteaseCloudMusicApi` HTTP adapter。
- provider 选择由 `server/src/adapters/music/create-music-adapter.ts` 统一负责。
- `FAKERADIO_PROVIDER_MODE=auto` 时，server 启动阶段优先探测本地网易云服务；不可用时回退到 mock。
- `/api/health` 会暴露当前 `adapters.music` 状态，前端也会直接展示该状态。

### 真实 LLM

- `LlmAdapter` 已支持 `mock` 和 `DeepSeek`（OpenAI 兼容 API）。
- 有 `FAKERADIO_DEEPSEEK_API_KEY` 时自动使用 DeepSeek，否则回退到 mock。
- DeepSeek adapter 使用 `max_tokens: 4096`（推理模型需要额外 token 完成 reasoning），system prompt 追加 DjDecision schema 描述。
- `/api/health` 的 `adapters.llm` 反映当前状态（`ready` / `mock`）。

### 真实 TTS

- `TtsAdapter` 已支持 `grok`（xAI Grok TTS）和 `mimo`（MiMo V2.5 TTS）。
- 通过 `FAKERADIO_TTS_PROVIDER` 切换：Grok 需要 `FAKERADIO_XAI_API_KEY`（或 `XAI_API_KEY`），MiMo 需要 `FAKERADIO_MIMO_API_KEY`。
- TTS 使用 provider-aware 缓存键（`hash(text, provider, voice/style/rate)`），防止跨 provider 缓存碰撞。
- 音频格式：MiMo 返回 WAV（16-bit PCM 24kHz），缓存文件扩展名与格式一致。
- TTS 失败时回退到本地可听 TTS，不阻断主流程。

### 真实天气

- `WeatherAdapter` 已支持 `mock` 和 `OpenWeatherMap`。
- 有 `FAKERADIO_OPENWEATHER_API_KEY` 时自动使用 OpenWeatherMap，否则回退到 mock。
- 遵循与 LLM/TTS 相同的 auto-detect 模式，不需手动切换 provider。
- `/api/health` 暴露 `adapters.weather` 状态。

### 真实日历

- `CalendarAdapter` 已支持 `mock` 和 `Lark`（飞书日历）。
- 有 `FAKERADIO_LARK_APP_ID` 时自动使用 Lark Calendar adapter。
- `/api/health` 暴露 `adapters.calendar` 状态。

### Grounded DJ 决策

- `/api/next` 当前采用两段式流程：先生成选歌 query，再在拿到真实曲目后重新生成 grounded DJ 文案。
- grounded 阶段会把 `music.provider`、`music.selectedTrack` 和当前队列信息注入到 `toolResults`。
- DJ 文案必须围绕真实选中的曲目生成，不能再假装 provider 结果不存在。
- `/api/next` 选择候选曲目时会尽量避开当前正在播放的曲目；如果真实搜索和启动队列都没有可用曲目，会用 mock music adapter 做单次兜底。

### 对话式节目编排

- 用户可以通过自然对话与 DJ 交互，完成节目编排的全流程：创建 → 修改 → 确认 → 生成。
- 意图检测采用两层策略：regex 快速路径（零延迟匹配明确指令）+ LLM 兜底检测（自然语言理解隐含意图）。
- `ShowPlanGenerator` 使用 `LlmAdapter.computeJson()` 生成个性化节目 block（LLM 失败时回退 mock）。
- `BriefIntentParser` 支持 LLM 兜底意图检测（如"最近在听很多 City Pop"→ 识别为节目创建意图）。
- 多轮对话通过 `SessionRepository` 推断上下文，不引入独立 conversation state。
- 聊天返回的 `ChatResponse.action.type` 扩展为支持 `show-brief-created`、`show-plan-refined`、`show-confirmed`、`show-cancelled`。

### 用户偏好接入

- server 启动时读取 `user/taste.md`、`user/routines.md`、`user/mood-rules.md`，替换此前硬编码在 `create-server.ts` 中的默认字符串，注入 DJ brain 的 `computeDjDecision`。
- `user/playlists.json` 中的歌单定义用于动态生成 `buildTodayPlan` 的时段 block，`moodHint` 取自对应 playlist 的首个 `seed`。
- 选歌时的 `music.search` 和 `music.recommend` fallback 均使用当前时段 block 的 `moodHint`，不再固定使用 `"warm morning indie"`。
- 文件缺失或解析失败时，各模块优雅回退到与旧行为一致的默认值。

### 连续性与节律

- `buildTodayPlan(playlists?)` 生成当天的时段计划；传入 playlists 时动态构建 block（`moodHint` 取自对应 playlist 的首个 `seed`），未传入时使用硬编码默认值。
- `getCurrentPlanBlock()` 选出当前时段 block。
- 初始队列按当前 block 的 `moodHint` 生成。
- `/api/next` 会读取近期播放记忆，并在生成成功后追加最新 `playedTrack`。
- 当前 mock DJ 已可引用上一首歌，形成“不是每次都重新开始”的连续解释。

### 播放与口播稳定性

- TTS provider 出错时，server 会回退到本地可听 TTS 结果，避免 Grok / MiMo 等真实 provider 的运行时失败阻断 `/api/next`。
- 播放器收到 DJ 口播时会临时降低音乐音量；TTS 播放失败或淡入淡出计算越界时，前端必须把最终音量限制在浏览器允许的 `[0, 1]` 范围内。
- story audio（`speechAudio`）播放失败时，前端不再自动回退到纯音乐，而是进入 `error` 状态并提示用户「口播加载失败」。

### 播放器 UI

- 主界面为全端统一的 440×812 手机框（frontend 4.0，2026-07-02），light/dark 双主题（localStorage 旧值 bone/graphite 自动迁移）。逻辑在 `editorial-radio.tsx`，渲染层拆在 `radio-screen.tsx` / `radio-chat.tsx`，面板共享设计语言在 `features/show/panel-ui.tsx`。
- 节目库/设置/网易云登录收在右上角汉堡菜单；节目库覆盖层内含 制作/节目库/今日 三个 Tab。
- 皮肤系统已全部删除（2026-07-02 删掉 `skin-amber.tsx`/`skin-stage.tsx`/`useRadioBridge`），`skin-config.ts` 仅保留 `QUICK_PROMPTS` 快捷指令。

### 播放器诊断

- RADIO AI 区显示 stream 连接状态（CONNECTED / OFFLINE）；播放错误显示在播放器下方错误行。
- QUEUE 栏展开显示真实待播队列（episode 播放中 = 已预取的下一首）。
- EQ 可视化只画真实频谱（音乐 + 口播双元素 AnalyserNode），无假动画退路。

### Story Episode 播放闭环

FakeRadio 已实现 story-first 电台播放闭环。核心新增术语：

#### RadioEpisode

一个完整电台节目单元，绑定下一首曲目、故事文案、故事 TTS、资料来源和播放参数。详见 `GET /api/episode/next` 和 `packages/shared` 中的 schema。

#### StorySourceAdapter

故事资料来源边界。已接入：
- 网易云歌词（`kind: “lyric”`）
- MusicBrainz 公开元数据（`kind: “metadata”`）
- Brave Search 网页研究（`kind: “web”`，需 API key）
- Mock 兜底（`kind: “mock”`）

#### StoryType

故事真实性等级（证据门槛从高到低）：
- `background`：有 metadata/web source（confidence >= 0.5）支持的创作背景
- `lyric-theme`：有歌词支撑的主题解读
- `mood-reading`：资料不足时的情绪解读

没有来源支撑时，不允许把 `mood-reading` 伪装成真实创作幕后。

#### 前端状态机

Playback: `idle → preparing → story → crossfade → music`（含 `error`），状态转移定义在 `episode-state-machine.ts`，支持自动预取下一集形成连续循环。

#### 播放参数

`playback.crossfadeStartOffsetMs`（默认 3000）与 `playback.musicStartVolume`（默认 0.2），控制 story 快结束时音乐渐入。

规划入口：
- `docs/superpowers/specs/`（Story Episode 设计规格）
- `docs/superpowers/plans/`（预热调度设计）

## 必须保持的约束

1. 先完成 mock contract 和本地闭环，再接真实 provider。
2. 外部能力必须通过 adapter 接口接入。
3. 文档必须自包含，不依赖外部截图或历史对话才能理解架构。
4. 结构化 DJ 输出必须能被共享 contract 校验。
5. 任何新能力都要先说明它属于哪一层、落在哪个边界。

## 当前非目标

以下内容暂时不作为当前阶段目标：

- 做成面向多用户的 SaaS。
- 直接支持多种前端客户端同时各自编排 provider。
- 在核心流程里混入 provider 专有逻辑。
- 为未验证需求提前做高度抽象的插件系统。

## 关键目录

- `apps/web/`：PWA 播放器。
- `server/`：本地服务中枢。
- `packages/shared/`：共享 contract、schema、事件类型。
- `user/`：用户可编辑语料和偏好文件。
- `prompts/`：DJ prompt 和上下文模板。
- `docs/`：架构、API、runbook 和 ADR。

## 变更时的判断准则

如果一个变更无法回答下面三个问题之一，就应先停下来补上下文：

1. 它属于哪一层？
2. 它穿过了哪些边界？
3. 它改变的是 contract、实现，还是运行策略？
