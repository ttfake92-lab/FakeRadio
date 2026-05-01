# ADR 0001: 本地优先的 FakeRadio 架构

## 背景

FakeRadio 的目标不是做一个泛化的在线音乐平台，而是做一个围绕单个用户品味、日常节奏和即时环境运转的个人音乐电台。

在这个目标下，系统需要同时满足几件事：

- 前端体验要足够轻，能像播放器一样持续运行。
- 编排逻辑要有稳定中枢，负责调度、状态和大模型决策。
- 音乐、TTS、天气、日历和设备等外部能力会持续变化，不能把 provider 细节写死在核心流程里。
- 项目需要先完成本地闭环，再逐步接入真实服务。

如果没有一个明确架构决策，后续很容易出现这些问题：

- 前端直接连接外部服务，导致凭证、状态和策略分散。
- provider 专有逻辑渗透到 DJ 决策和调度层。
- 共享 contract 不稳定，前后端各自演化。
- 文档和实现越来越依赖某一次对话或参考图，而不是仓库内可检索事实。

## 决策

FakeRadio 采用本地优先的四层架构：

1. 外部上下文层：用户语料、LLM、音乐、TTS、天气、日历、UPnP 等外部能力。
2. 本地大脑层：intent router、context builder、DJ brain、scheduler、state、tts cache。
3. 运行时 context window：六类 fragments 组装成模型输入。
4. 交互层：PWA 播放器、本地 HTTP contract、WebSocket stream、单一 audio 播放管线。

同时固定以下边界：

- `apps/web` 只连接本地 server，不直接访问外部 provider。
- `server` 负责 orchestration、调度、状态和 adapter 调用。
- 所有外部能力都通过 adapter interface 接入。
- 前后端共享 contract 统一落在 `packages/shared`。
- 新能力先以 mock contract 接入，跑通本地闭环后再替换为真实 provider。

## 影响

正向影响：

- 前端保持简单，能专注在播放器体验和本地状态呈现。
- server 成为清晰中枢，便于管理凭证、缓存、节奏调度和长期记忆。
- provider 可替换，后续从 mock 切换到真实服务的风险更可控。
- shared contract 能稳定约束 HTTP、WebSocket 和结构化 DJ 输出。
- 文档和实现更容易保持一致，减少“知道图但不知道代码边界”的情况。

代价与限制：

- 初期需要多维护一层本地 server，而不是直接在前端拼接能力。
- 真实 provider 接入时要先写 adapter，短期开发速度会稍慢一点。
- 任何跨层需求都需要先想清楚边界，不能为了省事直接穿透。

## 备选方案

### 方案一：前端直接调用外部服务

优点是起步快，但会导致凭证管理、状态连续性和 provider 差异处理散落在浏览器端，不适合作为长期架构。

### 方案二：单体脚本式实现

把调度、模型调用、音乐搜索和播放都放在一个 Node.js 脚本里，短期最省事，但很快会失去边界，难以演进到稳定的 PWA + server 结构。

### 方案三：一开始就做高度抽象的插件系统

这会提前为未验证需求付出复杂度成本，不符合当前“先闭环、后替换 provider”的阶段目标。

## 后续动作

1. 继续让新功能优先落在既有四层边界内。
2. 真实 provider 接入前，先补对应 adapter contract。
3. 当 shared contract、状态模型或调度模型出现重大变化时，新增后续 ADR，而不是修改本 ADR 的历史结论。
