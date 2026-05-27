# FakeRadio Show Production PRD

## 产品定位

FakeRadio 的下一阶段目标是：**AI 生成的个人播客 / 电台制作系统**。

它不再只是一个“本地 AI 音乐播放器”，而是一套本地优先的节目制作工具：用户通过和 LLM/DJ 对话表达制作意图，系统把意图整理成节目 Brief，规划故事驱动的 ShowPlan，生成或预热 episode，保存制作轨迹，最后导出一份可本地回听的节目工程包。

默认使用场景是个人本地回听。公开发布、去版权导出、创作者授权导出不进入默认主线，后续作为独立模式设计。

## 北极星体验

用户可以说：

> 帮我做一期围绕 Bee Gees 展开的主题节目。

FakeRadio 应该能识别这是制作意图，而不是普通聊天，然后完成：

1. 创建可持久化的 `ProgramBrief`。
2. 生成故事驱动的 `ShowPlan draft`。
3. 在用户可编辑或未响应时按计划进入生成 / 预热任务。
4. 生成每个 block 下的 `RadioEpisode`，包含选歌、故事、来源、TTS、音频预取状态。
5. 在生成控制台实时展示日志流、技术 trace 和阶段时间线。
6. 在默认竖屏主窗口中保持监听台 + LLM/DJ 聊天为主，不强行铺满制作后台。
7. 导出本地节目工程包：`show.mp3`、`show-notes.md`、`show-plan.json`、`production-trace.jsonl`。

## 核心原则

- 本地优先：PWA 只调用本地 server，本地 server 负责 orchestration、adapter、state、scheduler、job 和导出。
- LLM 驱动：用户主要通过聊天表达制作意图、追加约束、暂停、取消和询问状态。
- 工具面板可折叠：Production Board、Render / Export Queue、Settings 默认可折叠关闭，不抢主界面。
- 故事驱动：主题节目先规划叙事线，再让歌曲服务于叙事线，而不是随机歌单加口播。
- 事实有来源：真实公开资料和用户记忆优先，LLM 负责组织叙事，不把无来源内容写成事实。
- 可审计：展示制作台日志和摘要级技术 trace，隐藏密钥、cookie、完整 system prompt 和私人记忆原文。
- 可版本化：关键修改生成新的 ShowPlan 版本，旧版本进入 trace，已预热内容需要重算时明确标记。

## 产品模式

### Daily Show

Daily Show 是默认日常模式。

- 默认单位是一天一期节目。
- 按用户品味、播放历史、收藏、时间、天气、日程和当天节律准备全天节目池。
- 强避开最近播放，保持日常陪伴的新鲜感。
- 导出默认收录当天互动、收藏或故事性较强的精选片段。

### Theme Story Show

Theme Story Show 是第一阶段 MVP 主线。

- 用户明确说“做一期围绕 XX 的节目”时创建整期主题 Brief。
- 用户说“今晚 / 某个时段想听 XX”时创建 block 级主题 Brief。
- 用户闲聊或表达口味时只写入 memory / taste，不创建节目 Brief。
- 默认长度 45-90 分钟；短版 20-30 分钟；完整版 90-150 分钟。
- 不默认避开最近重复；主题完整性优先。
- 允许同一艺人连续多首；约束重点是故事段落节奏。
- 用户库优先，但外部相关曲目可补足故事线，默认最多 60%。超过 60% 需要 LLM 说明理由或用户明确允许。
- 每首库外曲目必须在 trace / show notes 中说明加入理由，例如 `representative-work`、`era-context`、`influence-link`、`cover-version`。

## LLM / DJ 身份

LLM/DJ 是双身份：

- 制作人：在聊天里理解意图、创建 Brief、规划 ShowPlan、解释选歌、控制生成任务、处理导出。
- 主持人：在节目音频里讲故事、串歌、制造陪伴感和节目氛围。

两者共享核心 persona，但表达分层。例如同一个 persona 在制作人模式下清晰克制，在主持人口播中更故事化、更有电台感。

## 默认信息架构

默认主窗口保持竖屏心智，但不锁定固定比例，以适配现有多套主题。

- 上方：时间、当前节目、监听台、播放状态。
- 下方：LLM/DJ 聊天区域，是主要控制入口。
- Production Board：可折叠 / 可关闭，展示 show -> block -> episode 三层结构，默认只展开 block。
- Generation Console：可展开页面，日志流为主，结构化制作时间线为辅。
- Render / Export Queue：可折叠 / 可关闭，展示导出任务状态和产物。
- Settings：可折叠 / 可关闭，管理 provider、音色、用户资料、版权边界和 trace 隐私。

五套主题可以有不同交互表达，但必须共享同一套制作工具 contract。主题是不同电台人格 / 设备感，不是五个不同产品。

## 生成控制台

生成控制台用于实时观察后台自动化。

默认展示日志流，日志分两层：

- 制作台日志：人能读懂的制作过程、取舍和进度。
- 技术栈 trace：job、adapter、LLM call、provider、cache、TTS、audio、export、fallback、耗时和错误摘要。

第一版中途干预只支持：

- 暂停
- 取消
- 追加约束

追加约束会让 job 进入 `needs-replan`，或生成新的 `ShowPlan` 版本。

trace 默认展示摘要级信息，可展开查看输入摘要、输出摘要、来源 URL、候选列表和错误摘要；不展示密钥、cookie、完整 system prompt、完整私人记忆原文。

## 关键领域对象

### ProgramBrief

`ProgramBrief` 是用户制作意图的持久化表达。

建议字段：

- `id`
- `type`: `daily-show` | `theme-show` | `block-theme`
- `topic`
- `scope`: `full-show` | `block`
- `targetDate`
- `targetBlockAt`
- `priority`: `user-requested` | `daily-default`
- `constraints`
- `status`: `draft` | `confirmed` | `scheduled` | `generating` | `completed` | `cancelled`
- `createdFromMessageId`
- `createdAt`
- `updatedAt`

### ShowPlan

`ShowPlan` 是故事线脚本大纲，不是简单排歌表。

Theme Story Show 的 block 由 LLM 根据主题生成，默认 4-8 个 block，但 role 必须来自有限集合：

- `opening`
- `origin`
- `turning-point`
- `signature-era`
- `relationship`
- `influence`
- `contrast`
- `personal-anchor`
- `closing`

每个 block 至少包含：

- `role`
- `title`
- `storyGoal`
- `selectionGoal`
- `sourceNeeds`
- `constraints`
- `episodeTargets`

### ShowProject

每期节目是一个本地工程。

- SQLite 保存元数据与状态：Brief、ShowPlan 版本、job、episode 状态、trace 索引。
- 文件系统保存工程产物：`show.mp3`、`show-notes.md`、`show-plan.json`、`production-trace.jsonl`、TTS/audio 缓存引用。
- 推荐目录：`user/shows/YYYY-MM-DD-theme-slug/`。

## 阶段目标

### Phase 0 - 目标重置与稳定门禁

目标：把产品目标、旧 PRD 映射、第一批 issue 和自动推进计划落地；同时明确当前测试失败和 dirty worktree 是实现前门禁。

验收：

- 新总 PRD 存在并自包含。
- 已有分支 PRD 映射到新主线。
- 第一批 Theme Story Show MVP issue 发布到本地 issue tracker。
- 有一份可用于定时任务的详细推进计划。
- 当前 `pnpm test` 失败项被记录为实现前必须处理的稳定问题。

### Phase 1 - Theme Story Show MVP

目标：闭合“用户制作意图 -> Brief -> ShowPlan -> Generate now -> 生成日志 -> Production Board -> Export Package”的最小主链路。

验收：

- 用户说“帮我做一期 Bee Gees 主题节目”后，系统创建 Brief。
- 系统生成可版本化 ShowPlan draft。
- `Generate now` 以后台 job 运行，Generation Console 能看到日志流和阶段状态。
- 主题选歌遵循用户库优先、外部补足上限 60%、不避开最近重复、允许同艺人连续的规则。
- Production Board 以可折叠面板展示 show -> block -> episode。
- 导出工程包包含 `show.mp3`、`show-notes.md`、`show-plan.json`、`production-trace.jsonl`。

### Phase 2 - Schedule Tonight 与 Daily Show

目标：把 Phase 1 的同一套 job 接入夜间调度，并恢复 Daily Show 的全天节目池语义。

验收：

- `Schedule tonight` 保存到夜间生成队列。
- 常驻 server 在夜间读取 Brief 并执行同一套生成 job。
- Daily Show 强避开最近播放。
- Theme Story Show 不默认避开最近重复。
- 预热状态和生成日志能在 UI 中查看。

### Phase 3 - 制作体验深化

目标：增强节目编辑、版本管理和生成干预。

验收：

- 用户可在 ShowPlan draft 上追加约束并生成新版本。
- 已预热内容需要重算时明确标记。
- Generation Console 支持暂停、取消、追加约束。
- Settings 能控制外部资料研究、provider、音色、trace 隐私。

### Phase 4 - 导出与长期节目库

目标：把本地节目工程变成可管理的节目库。

验收：

- 用户可以浏览历史 show project。
- 可以删除单期 trace 或整期工程。
- 可以选择导出是否包含 trace。
- 公开发布 / 去版权版 / 授权版作为独立模式进入后续 PRD。

## 已有分支 PRD 到新主线的映射

| 现有主题 | 现状角色 | 新主线归属 | 处理策略 |
|---|---|---|---|
| `.scratch/fakeradio-v1/PRD.md` | 本地优先电台技术底座 | Phase 0 / 技术基础 | 保留为历史底座，不覆盖 |
| `.scratch/fakeradio-story-episode/PRD.md` | `RadioEpisode`、故事资料、story-first 播放 | Phase 1 / episode 生成单元 | 吸收为 ShowPlan 下的 episode 层 |
| `.scratch/fakeradio-agent/PRD.md` | 对话控制、主动陪伴、导出节目 | Phase 1 / 制作人入口与导出 | 重新归并到 ProgramBrief、job、Export Package |
| `.scratch/fakeradio-daily-episode-prewarm/` | 全天预热、prepared pool、可审计轨迹 | Phase 2 / Schedule Tonight | 先服务 Theme Show，再扩展 Daily Show |
| `.scratch/fakeradio-personal-recommendation/PRD.md` | 用户库候选、LLM rerank、诊断 | Phase 1 / 主题选歌和用户库锚点 | 作为 selection engine 的输入 |
| `.scratch/fakeradio-skin-integration/PRD.md` | 五套皮肤与 bridge | Phase 1 / 可折叠主界面 | 保持 contract 统一，各主题适配 |
| `.scratch/fakeradio-mimo-v25-tts/PRD.md` | TTS provider 与音色设置 | Phase 3 / Settings 与主持人口播 | 进入音色与 provider 配置 |
| `.scratch/code-review/issues/` | 代码质量与稳定性问题 | Phase 0 / 稳定门禁 | 在实现前优先处理高风险失败和当前测试红灯 |

## 非目标

- 不在第一阶段做公开发布。
- 不在第一阶段实现复杂在线重排。
- 不在第一阶段要求所有主题资料都能找到真实背景。
- 不展示模型隐藏推理链原文。
- 不把 provider 逻辑写进前端或 DJ brain。
- 不把五套主题做成五套不同产品。

## 当前门禁

进入实现前必须先处理：

- `pnpm test` 当前有 1 个失败：prepared episode 被消费后不应复用的用例超时。
- 当前工作区存在大量 dirty 文件和运行态文件，需要分类：源码 / 测试 / 文档 / issue tracker 与个人数据 / 缓存 / DB。
- 只在门禁处理完成后进入 Phase 1 实现，避免新目标建立在不稳定状态上。
