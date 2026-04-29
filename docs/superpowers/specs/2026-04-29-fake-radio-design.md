# FakeRadio 设计方案

## 目标

FakeRadio 是一个本地优先、由大模型驱动的个人音乐电台。它采用“播放器界面 + 本地服务中枢 + 多个能力 adapter + 大模型编排器”的架构：PWA 播放器连接本地 Node.js 服务，本地服务负责协调用户品味文件、音乐搜索与播放、语音合成、环境输入、节奏调度、持久化状态，以及像个人 DJ 一样工作的 LLM 大脑。

本设计先创建“架构完整版”的项目骨架。真实服务商接入可以在后续实现中放到稳定的 adapter 接口之后。

## 成功标准

- `/Users/tt/projects/FakeRadio` 是一个独立 git 仓库。
- 项目结构能清楚覆盖目标流程：PWA 播放器、本地服务、用户上下文、LLM 大脑、音乐 adapter、语音与 I/O adapter、状态、调度器、HTTP/WebSocket contract。
- 第一版骨架包含目录边界、TypeScript package 布局、API contract、配置样例、prompt/user 文件和说明文档。
- 外部服务都通过可替换 adapter 表达，不把具体产品逻辑硬编码进核心流程。
- 后续的人或 agent 可以直接从文档继续实现，不需要反向猜架构意图。

## 假设

- 包管理器：pnpm。
- 语言：TypeScript。
- 前端：Next.js PWA。
- 本地服务：Node.js + Fastify。
- 仓库形式：monorepo，包含 apps、server、packages、docs、prompts、user 等目录。
- 状态设计：SQLite 保存持久事件与状态，Markdown/JSON 文件保存可编辑的用户品味和日程偏好。
- 第一版实现不调用真实的 Netease、FishAudio、Feishu、Weather、UPnP 或 LLM API，只定义 adapter 和可 mock 的 contract。

## 目标流程文字化说明

系统由四层组成：外部上下文、本地大脑、运行时 context window、交互层。后续实现只依赖本节文字描述。

### 第一层：外部上下文

流程要素：

- `USER/`：`taste.md`、`routines.md`、`playlists.json`、`mood-rules.md`。
- `BRAIN`：类似 Claude Code 的模型进程，输出 JSON。
- `MUSIC`：NeteaseCloudMusicApi 能力，例如 search、song URL、lyric、recommend。
- `VOICE + I/O`：Fish TTS、Feishu/Lark、weather、UPnP。

FakeRadio 映射：

- `user/taste.md`：长期音乐品味、不喜欢的模式、偏好的电台语气。
- `user/routines.md`：日常节奏、时间段、日历预期。
- `user/playlists.json`：人工维护的种子歌单和歌单元数据。
- `user/mood-rules.md`：把天气、时间、用户输入、近期播放翻译成 mood hint 的规则。
- `server/src/adapters/llm/`：模型 adapter 接口和具体 provider 实现。
- `server/src/adapters/music/`：搜索、解析音频 URL、歌词、推荐。
- `server/src/adapters/tts/`：把 DJ 文案合成为缓存音频文件。
- `server/src/adapters/io/`：天气、日历、Feishu/Lark、UPnP 和其他外部信号。

这一层可以复现，因为每个外部依赖都有命名清晰的文件边界和稳定的 TypeScript 接口。

### 第二层：本地大脑

流程要素：

- `router.js`：意图分流。
- `context.js`：从 taste、routines、环境、历史和 system prompt 组装提示词。
- `claude.js`：LLM adapter，解析 `{ say, play, reason, segue }`。
- `scheduler.js`：节奏调度。
- `tts.js`：语音合成缓存。
- `state.db`：messages、plays、plan、prefs、长期记忆。

FakeRadio 映射：

- `server/src/router/intent-router.ts`：分流 chat、next-track、planned-radio 和自然语言命令。
- `server/src/context/context-builder.ts`：从六类片段构建 context window。
- `server/src/brain/dj-brain.ts`：调用 LLM adapter，并校验结构化 DJ 决策。
- `server/src/scheduler/radio-scheduler.ts`：生成带时间感的电台计划和 hook。
- `server/src/tts/tts-cache.ts`：把 DJ 口播转换为可复用的缓存音频路径。
- `server/src/state/`：数据库 schema、repository、文件偏好加载器。

这一层可以复现，因为核心脚本职责会变成职责明确的模块。

### 第三层：运行时 Context Window

流程片段：

- System prompt。
- 用户语料。
- 环境注入。
- 已检索记忆。
- 用户输入和工具结果。
- 执行轨迹。

FakeRadio 映射：

- `prompts/dj-persona.md`：DJ 身份、行为方式、输出风格。
- `user/*.md` 和 `user/playlists.json`：可编辑的个人上下文。
- `server/src/context/environment-fragment.ts`：now、weather、calendar、可用播放设备。
- `server/src/state/memory-repository.ts`：近期消息、播放、计划、学习到的偏好。
- `server/src/context/request-fragment.ts`：`/api/chat`、`/api/next`、音乐搜索和工具结果。
- `server/src/context/execution-fragment.ts`：scheduler 状态、当前队列、当前播放、TTS 缓存状态。

模型输出 contract：

```ts
type DjDecision = {
  say: string;
  play: {
    query?: string;
    trackId?: string;
    reason: string;
  };
  reason: string;
  segue: string;
};
```

这能复现核心模型步骤：`compute(fragments) -> { say, play, reason, segue }`，随后解析播放队列、合成 TTS，并通过 WebSocket 广播 now-playing。

### 第四层：交互层

流程要素：

- localhost 上的 PWA。
- Player、Profile、Settings 三个视图。
- 单一 audio 元素。
- WebSocket chat/stream。
- Service worker 缓存和预取。
- HTTP contract：`POST /api/chat`、`GET /api/now`、`GET /api/next`、`GET /api/taste`、`GET /api/plan/today`、`WS /stream`。

FakeRadio 映射：

- `apps/web/`：Next.js PWA，包含 Player、Profile、Settings，以及单一音频播放管线。
- `packages/shared/src/contracts/`：前后端共享的 request/response 类型。
- `server/src/http/routes/`：Fastify route，承载 HTTP contract。
- `server/src/realtime/stream.ts`：WebSocket 事件，广播 now-playing、queue、DJ speech、diagnostics。
- `apps/web/src/lib/api-client.ts`：本地 server contract 的客户端封装。

这一层可以复现，因为第一版 public contract 保留了个人音乐电台闭环所需的核心 endpoint。

## 架构

```text
apps/web
  Next.js PWA 播放器
  Profile 和 Settings 视图
  HTTP client 与 WebSocket stream client

server
  Fastify 本地 API 服务
  intent router
  context builder
  DJ brain
  scheduler
  adapters
  state

packages/shared
  API contracts
  shared schemas
  event types
  common utilities

user
  可编辑的个人品味和日程文件

prompts
  模型 prompt 和 context 模板

docs
  架构、启动方式、API contract、adapter 指南
```

前端永远不直接调用外部服务，只和本地 server 通信。server 负责 orchestration、provider 凭证、状态和长周期决策。

## 建议文件结构

```text
FakeRadio/
  AGENTS.md
  README.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  .env.example
  apps/
    web/
      package.json
      next.config.ts
      public/
        manifest.webmanifest
      src/
        app/
        components/
        features/player/
        features/profile/
        features/settings/
        lib/api-client.ts
  server/
    package.json
    tsconfig.json
    src/
      index.ts
      config/
      http/
      realtime/
      router/
      context/
      brain/
      scheduler/
      adapters/
        llm/
        music/
        tts/
        io/
      state/
      types/
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        contracts/
        schemas/
        events/
        index.ts
  user/
    taste.md
    routines.md
    playlists.json
    mood-rules.md
  prompts/
    dj-persona.md
    context-window.md
  docs/
    architecture.md
    api-contract.md
    adapters.md
    local-runbook.md
    superpowers/
      specs/
```

## HTTP 和 WebSocket Contract

初始 route：

- `GET /api/health`：本地 server 健康状态和 adapter 就绪状态。
- `GET /api/now`：当前歌曲、DJ 口播、播放状态、队列预览。
- `GET /api/next`：让 server 计算或获取下一首可播放内容。
- `POST /api/chat`：用户发给 DJ 大脑的消息或命令。
- `GET /api/taste`：用户品味文件的规范化视图。
- `GET /api/plan/today`：当天的 scheduler 计划。
- `WS /stream`：now-playing、queue、DJ speech、chat、diagnostics 事件。

route 列表保留个人音乐电台闭环所需接口，只额外添加 `GET /api/health` 用于本地诊断。

## Adapter 边界

每个 adapter 都有 port interface，第一版骨架至少提供一个 mock 实现。

- LLM adapter：接收 context fragments，返回经过校验的 `DjDecision`。
- Music adapter：搜索、推荐、解析音频 URL、获取歌词。
- TTS adapter：接收文本和声音设置，返回缓存音频文件的 URL/path。
- Weather adapter：返回当前天气和粗粒度 mood hint。
- Calendar adapter：返回近期日程上下文。
- UPnP adapter：发现本地设备并推送播放。

真实 provider 都是实现细节。系统其他部分只依赖接口。

## 状态模型

持久状态拆成两类：人可编辑文件和应用状态。

- 人可编辑文件放在 `user/`。
- 应用状态放在 `server/src/state/`，计划使用 SQLite。
- TTS 音频缓存放在 `server/cache/tts/`。
- 音乐缓存和临时 provider 响应放在 `server/cache/music/`。

第一版骨架包含 schema 文档和 repository 接口。真实 SQLite 持久化在 mock flow 和 contract tests 跑通后再实现。

## 测试策略

第一版骨架提供架构 contract 的测试入口，不追求完整 provider 行为。

- Shared contracts：schema validation tests。
- Context builder：片段顺序确定性的测试。
- DJ brain：mock LLM 输出校验测试。
- HTTP routes：health 和 contract shape 测试。
- Web app：UI 实现后，对 Player/Profile/Settings route 做 smoke test。

## 第一版骨架不包含

- 真实 Netease 登录或串流实现。
- 真实 FishAudio 合成。
- 真实 Feishu/Lark 日历集成。
- 真实 UPnP 播放。
- 生产部署。
- 多用户账号。
- 推荐质量调优。
- 完整视觉设计打磨。

## 实现默认值

- LLM provider：先用 mock adapter，真实 provider 后续放到 `server/src/adapters/llm/`。
- 本地开发：web app 和 server 分别跑在不同端口，根目录脚本负责同时启动两者。
- 持久化：先写 repository 接口和 schema notes；mock flow 跑通后再实现 SQLite。
- Provider 集成：在 shared contracts 和本地 API routes 验证前，所有外部服务都使用 mock。
