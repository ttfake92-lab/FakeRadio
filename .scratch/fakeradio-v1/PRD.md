# FakeRadio V1 PRD

## Problem Statement

FakeRadio 目前已经具备本地优先的基本闭环：PWA 播放器连接本地 server，本地 server 负责 orchestration，外部能力通过 adapter 接入，前后端通过 shared contract 对齐。

但从产品角度看，当前系统仍存在三个关键问题：

1. 模块边界虽然已经在代码和架构文档中初步建立，但还没有一份统一、面向执行的 PRD 把产品目标、用户故事、模块职责、验收口径和非目标固定下来。
2. 各模块后续要继续演进，例如 DJ brain、真实音乐来源、TTS、状态、节律、环境输入、运行诊断等，如果没有统一 PRD，容易出现“每个模块各写各的、术语不一致、验收标准不一致”的问题。
3. 当前真实音乐来源已经接入到 adapter 边界，但系统仍处于“局部能力已跑通、整体产品叙事和任务拆分尚未规范化”的阶段，缺少一个可长期维护的 issue 体系。

从用户视角看，FakeRadio 要解决的是：

- 我希望有一个真正围绕我自己品味、节律和环境运行的本地 AI 音乐电台；
- 我希望它在模块演进时保持一致，不因为不同阶段的实现者不同，就让产品边界越来越模糊；
- 我希望它的后续开发可以被拆成清晰、可验证、可并行推进的 slices，而不是靠临时聊天记忆。

## Solution

为 FakeRadio V1 建立一套统一的产品与执行规范：

1. 以一份总 PRD 统一描述产品目标、模块边界、用户故事、实现决策、测试决策和非目标。
2. 在统一 PRD 下，按“可独立验证的端到端 vertical slice”拆出本地 issue，而不是按前端 / 后端 / 数据库等水平层拆任务。
3. 用统一的领域词汇描述所有模块：播放器体验层、本地服务中枢、DJ brain 与 context fragments、音乐来源 adapter、TTS 与口播链路、状态与调度、环境输入 adapter、运行与可观测性。
4. 要求每个后续模块演进都能回答：
   - 它属于哪一层？
   - 它穿过了哪些边界？
   - 它改变的是 contract、实现，还是运行策略？

这样，FakeRadio 的后续开发就会围绕一套稳定的产品语言推进，而不是围绕零散对话推进。

## User Stories

1. 作为一个长期使用 FakeRadio 的用户，我希望整个项目有一份统一 PRD，这样我就不用靠聊天记录回忆系统到底要做成什么样。
2. 作为一个继续开发 FakeRadio 的实现者，我希望模块边界被统一写清楚，这样我改一个模块时不会不小心把别的层级也搅乱。
3. 作为一个继续维护 PWA 播放器的人，我希望知道播放器只消费本地 server contract，这样我不会把外部 provider 逻辑误塞进前端。
4. 作为一个继续维护本地 server 的人，我希望知道 server 是 orchestration 中枢，这样我能把 provider 选择、调度、状态和 route 保持在合适位置。
5. 作为一个继续维护 DJ brain 的人，我希望知道 context fragments 的六类来源，这样我能把真实输入组织成可解释的 DJ 决策。
6. 作为一个使用 FakeRadio 的用户，我希望 DJ 的口播能围绕当前真实曲目、当前时段和我的节律，而不是说与实际播放脱节的话。
7. 作为一个继续维护音乐来源 adapter 的人，我希望真实 provider 接入只能发生在 adapter 边界内，这样我不会把 provider 细节泄漏到核心流程。
8. 作为一个使用 FakeRadio 的用户，我希望在本地网易云服务不可用时系统自动回退到 mock，这样我的电台不会直接瘫掉。
9. 作为一个继续维护 TTS 链路的人，我希望 DJ 文案、TTS 合成和播放器播放链路是一条完整路径，这样口播不会和当前播放状态脱节。
10. 作为一个使用 FakeRadio 的用户，我希望播放器看到当前 provider 状态、当前曲目来源和队列状态，这样我知道系统现在到底在用真实来源还是回退路径。
11. 作为一个继续维护状态层的人，我希望播放历史、计划和偏好有统一语义，这样系统才能形成连续性而不是每次请求都像第一次见我。
12. 作为一个使用 FakeRadio 的用户，我希望早晨、工作时段和晚间的音乐风格能随节律变化，这样电台像真的在“陪我过一天”。
13. 作为一个继续维护 scheduler 的人，我希望 daypart 节律和 today plan 有明确职责边界，这样调度不会和 DJ brain 职责混在一起。
14. 作为一个继续维护环境输入的人，我希望天气、日历和设备输入能作为明确的环境片段进入 context，而不是零散地被 route 拼接。
15. 作为一个使用 FakeRadio 的用户，我希望在天气、日程或可用播放设备变化时，系统能逐渐反映这些环境差异，而不是一直只按固定 query 选歌。
16. 作为一个继续维护 shared contract 的人，我希望所有新的 route payload、stream event 和结构化 DJ 输出先被 contract 固定下来，这样前后端可以稳定演进。
17. 作为一个继续维护本地运行链路的人，我希望 runbook 写清楚端口、依赖和健康检查方法，这样我能快速定位本地问题。
18. 作为一个使用 FakeRadio 的用户，我希望 health 接口告诉我当前各 adapter 状态，这样我知道系统是在正常模式、回退模式还是缺依赖模式。
19. 作为一个团队里的另一个 agent 或开发者，我希望 issue 粒度是端到端的薄 slices，这样我拿到一个任务就能独立完成并验证。
20. 作为一个安排工作的人，我希望能清楚看见哪些任务是 HITL、哪些是 AFK，这样我能知道哪些要人拍板，哪些可以直接推进。
21. 作为一个继续做真实 provider 集成的人，我希望每个 provider 的非目标也被写清楚，这样我不会把歌词、账号登录、歌单管理等复杂能力误塞进 V1。
22. 作为一个使用 FakeRadio 的用户，我希望系统优先把“陪伴感”和“稳定性”做好，而不是为了看起来高级就一次性上很多不稳定功能。
23. 作为一个继续维护测试的人，我希望测试重点围绕外部行为和边界契约，而不是实现细节，这样重构时不会让测试反过来绑架设计。
24. 作为一个继续演进 FakeRadio 的产品负责人，我希望每个模块后续都能回指到同一个 PRD，这样范围变更有统一落点。

## Implementation Decisions

- 产品以本地优先的四层架构推进：外部上下文、本地大脑、运行时 context window、交互层。
- 前端只连接本地 server，不直接连接外部 provider。
- server 是 orchestration 中枢，负责 route、调度、状态、provider 选择和 adapter 调用。
- 所有外部能力都通过 adapter interface 接入。
- 新能力必须优先说明它属于哪一层、落在哪个边界。
- 当前 V1 统一采用 8 个模块边界：
  - 播放器体验层
  - 本地服务中枢
  - DJ brain 与 context fragments
  - 音乐来源 adapter
  - TTS 与口播链路
  - 状态与调度
  - 环境输入 adapter
  - 运行与可观测性
- 模块工作拆分采用 vertical slice，而不是前端 / 后端 / 状态 / provider 的水平拆分。
- 当前真实音乐来源接入采用独立本地 `NeteaseCloudMusicApi` 服务，由 provider 工厂统一负责探测和回退。
- 当前真实音乐来源接入范围限定为 `search / recommend / resolve`，并通过 `musicStatus` 向 health 暴露运行状态。
- 当前 `recommend` 的实现决策是“mood 转 query，再搜索”，而不是直接依赖个性化推荐或登录态接口。
- 当前真实音乐来源已成功接到本地 server，health 能返回 `music: "ready"`，`/api/next` 能返回 `source: "netease"` 的真实曲目。
- 当前 DJ 文本决策仍然主要来自 mock LLM 语义，因此“真实曲目 grounding”应作为后续独立 slice 继续推进。
- V1 的统一任务编排将通过本地 Markdown issue tracker 管理，目录落在 `.scratch/fakeradio-v1/`。

## Testing Decisions

- 好测试的标准是：验证外部行为、可见 contract 和边界语义，而不是内部实现细节。
- 当前优先测试这些模块：
  - 本地服务中枢
  - DJ brain 与 context fragments
  - 音乐来源 adapter
  - 状态与调度
  - shared contracts
- 当前轻量测试这些模块：
  - 播放器体验层里的 `view-model`
  - API client
- 当前后补或联调测试这些模块：
  - 环境输入 adapter 的真实 provider
  - TTS 真实 provider
  - 设备 / UPnP
- 音乐来源 adapter 的好测试应覆盖：
  - provider 可用路径
  - provider 回退路径
  - 字段映射
  - `resolve` 成功与失败
- 本地服务中枢的好测试应覆盖：
  - `/api/health`
  - `/api/now`
  - `/api/next`
  - WebSocket stream 的行为语义
- DJ brain 的好测试应覆盖：
  - context fragments 是否被正确组织
  - 决策输出是否能通过 shared contract 校验
  - 工具结果与当前播放是否能影响决策
- 状态与调度的好测试应覆盖：
  - daypart 行为
  - today plan 生成
  - 持续记忆和播放历史的外部可见效果
- 当前代码库中的测试 prior art 包括：
  - `server/src/http/create-server.test.ts`
  - `server/src/adapters/mock-adapters.test.ts`
  - `server/src/adapters/music/*.test.ts`
  - `packages/shared/src/contracts/radio.test.ts`
  - `apps/web/src/features/player/player-view-model.test.ts`

## Out of Scope

- 多用户 SaaS 化
- 多客户端各自直连 provider
- 在核心流程里混入 provider 专有逻辑
- 一开始就引入高度抽象的插件系统
- 歌词、私人 FM、账号登录、歌单收藏与管理
- 多 provider 融合排序
- 运行时热切换 provider
- 在还没有统一 PRD 之前继续无边界扩展模块

## Further Notes

- 本 PRD 是 FakeRadio V1 的统一产品与模块规范，后续模块 issue 都应回指这里。
- 后续如果某个模块产生重大架构变化，应优先新增 ADR，而不是让 issue 自己发散出新架构。
- 当前 `.scratch/fakeradio-v1/issues/` 下的 issue 会按依赖顺序发布，并统一以 `needs-triage` 作为初始状态。
- “真实音乐来源接入”这件事在技术上已经取得可运行进展，但在产品规范上仍应被纳入统一 PRD 和 issue 体系，而不是当作孤立实现存在。
