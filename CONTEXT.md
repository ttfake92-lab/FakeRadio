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
- intent router、context builder、DJ brain、scheduler、state、tts 和 realtime 各自承担单一职责。
- 真实 provider 的差异由 adapter 吸收，不进入核心策略层。

### 共享 contract 边界

- 前后端共享类型以 `packages/shared` 为准。
- route payload、事件名和结构化 DJ 输出都应先落到 shared contract，再被应用层消费。

## 当前运行时模型

FakeRadio 目前按四层理解：

1. 外部上下文：用户语料、LLM、音乐、TTS、天气、日历、UPnP。
2. 本地大脑：router、context builder、DJ brain、scheduler、state、tts cache。
3. 运行时 context window：六类 fragments 组装后的 prompt 输入。
4. 交互层：PWA、HTTP contract、WebSocket stream、audio 播放管线。

## 当前已落地能力

### 真实音乐来源

- `music adapter` 已支持 `mock` 和本地 `NeteaseCloudMusicApi` HTTP adapter。
- provider 选择由 `server/src/adapters/music/create-music-adapter.ts` 统一负责。
- `FAKERADIO_PROVIDER_MODE=auto` 时，server 启动阶段优先探测本地网易云服务；不可用时回退到 mock。
- `/api/health` 会暴露当前 `adapters.music` 状态，前端也会直接展示该状态。

### Grounded DJ 决策

- `/api/next` 当前采用两段式流程：先生成选歌 query，再在拿到真实曲目后重新生成 grounded DJ 文案。
- grounded 阶段会把 `music.provider`、`music.selectedTrack` 和当前队列信息注入到 `toolResults`。
- DJ 文案必须围绕真实选中的曲目生成，不能再假装 provider 结果不存在。

### 连续性与节律

- server 启动时会先生成当日电台计划，并用当前时段 block 的 `moodHint` 初始化队列。
- `/api/next` 会读取近期播放记忆，并在生成成功后追加最新 `playedTrack`。
- 当前 mock DJ 已可引用上一首歌，形成“不是每次都重新开始”的连续解释。

### 播放器诊断

- 播放器状态条会显示播放状态、stream 状态、music provider 状态和同步状态。
- 当前曲目与队列会显示来源标签。
- 当 music provider 回退到 mock 时，前端会给出显式提示。

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
