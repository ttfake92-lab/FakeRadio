# 快速音色设定：HTTP API + Web 选择与持久化

Status: needs-triage

## Parent

- `.scratch/fakeradio-mimo-v25-tts/PRD.md`

## What to build

提供 **端到端可用的快速音色预设能力**：用户在 PWA（或等价最小面板）中看到当前预设枚举，选择后立即影响 **后续合成**所用音色策略，并重载后仍可保持。为避免仅改前端假状态，必须与 server 侧的 **当前运行时预设** 同步。

推荐实现路径（可替换为等价方案，但需保持纵向切片完整）：

1. **GET** `/api/tts/voice-presets`：返回可读名称、简短描述、`presetId` 列表。
2. **GET** `/api/tts/active-preset` 与 **PUT** `/api/tts/active-preset`：读写当前激活 `presetId`；持久化到仓库内 **`user/` 下的小型 JSON**（与其它 user 文件同属本地优先范式），或由实现阶段选定与 `load-user-preference` 一致的生命周期策略。
3. Server 侧在 `synthesize` 路径上读取 **最新激活预设**（需线程安全的进程内持有者或惰性读文件 + 防抖，避免每条请求狂刷盘）。
4. Web：在现有播放器壳或设置抽屉中放置 **下拉/分段控件**，调用上述 API；操作后提示「已对下一首口播生效」或与当前产品文案一致。
5. 契约：`packages/shared` 中为上述 JSON 增补 Zod schema（若有对外类型共享需求）。

若实现选择「预设变更需重启进程」，须在 PR 与用户文档中明示 —— **不推荐**，因与本 issue「快速设定」验收冲突。

## Acceptance criteria

- [ ] 不改变 `TtsResult` 对前端的语义；仅改变服务端选用音色的路径。
- [ ] GET/PUT 预设 API 有可注入单测覆盖（inject Fastify、`fs` mock 或小仓库 temp dir）。
- [ ] Web：至少一条 UI 自动化或组件测试，或等价稳定的手动验收清单写入 issue Comments。
- [ ] 与安全模型一致：**不要**从前端传送开放平台密钥；仅能选预设 id。
- [ ] README 或 `docs/local-runbook.md` 用两三句话说明如何用 UI 切换 MiMo 预设（中英 env 示例可指向 `DEVELOPMENT-GUIDE.md`）。

## Blocked by

- `.scratch/fakeradio-mimo-v25-tts/issues/02-tts-voice-preset-registry.md`

## Type

AFK（若必须与产品确认「运行时切换」语义，可把状态标为 `needs-info`，澄清后改为 `ready-for-agent`）
