# FakeRadio 代码审查改进计划

## 背景

- **第一次审查（2026-07-01）**：全仓库系统性审查，覆盖 server、web、shared 三个包，整理为 13 个 issue（#01-13）。
- **第二次审查（2026-05-04）**：聚焦最近 5 个 commit（DeepSeek/MiMo 集成、用户偏好、Brave Search 适配器），新增 issue #14-24。

## 审查范围

- `server/src/` — Fastify 本地服务中枢
- `apps/web/src/` — Next.js PWA 播放器
- `packages/shared/` — 前后端共享 contract
- 测试覆盖、类型安全、错误处理、架构边界

## 审查结论

### 正面亮点

- 架构边界严格：PWA 只连接本地 server，外部能力通过 adapter 接入。
- 共享 contract 使用 Zod 校验，前后端类型一致。
- 205 个测试全部通过，覆盖 adapter、brain、context、scheduler、状态机、view model 和集成测试。
- TypeScript 严格模式，启用 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。
- Mock-first 开发模式，所有 adapter 都有 mock 实现。
- Episode 状态机设计和测试覆盖完整（70 个 view model 测试）。
- 文档质量远超一般项目。

### 需要改进的领域

按优先级分为三类：

**高优先级（3 个）** — 架构和性能问题

| Issue | 标题 | 类型 |
|-------|------|------|
| 01 | 拆分 create-server.ts God Object | refactor |
| 02 | 拆分 player-shell.tsx 巨型组件 | refactor |
| 03 | TTS cache manager 改用异步 I/O | bug |

**中优先级（6 个）** — 健壮性和正确性

| Issue | 标题 | 类型 |
|-------|------|------|
| 04 | WebSocket 消息处理增加异常保护 | bug |
| 05 | 内存仓库增加大小限制 | bug |
| 06 | 修复 loadUserPreferences 中脆弱的 defaultBaseDir 回退 | bug |
| 07 | 修复 /api/health 中 TTS 状态判断逻辑 | bug |
| 08 | 增加优雅关停处理 | feature |
| 09 | 时段切换时刷新播放队列 | feature |

**低优先级（4 个）** — 代码质量和测试

| Issue | 标题 | 类型 |
|-------|------|------|
| 10 | 统一 DjDecision 类型与 Zod Schema | refactor |
| 11 | 统一 adapter 错误处理策略 | refactor |
| 12 | 为 buildContextWindow 补充独立单元测试 | test |
| 13 | 补充 scheduler 全时段覆盖 | feature |

**第二次审查新增（2026-05-04）— 来自最近 5 个 commit**

| Issue | 标题 | 类型 | 来源 |
|-------|------|------|------|
| 14 | Stream Bus broadcast 竞态条件 | bug | 第二次审查前已存在 |
| 15 | queue array 使用 const 声明 | bug | 同上 |
| 16 | CORS 允许任意 localhost 端口 | security | 同上 |
| 17 | 外部 HTTP 调用无重试逻辑 | bug | 同上 |
| 18 | API 响应缺少 Zod 验证 | bug | 同上 |
| 19 | 缺失响应压缩与连接超时 | performance | 同上 |
| 20 | 修复 health webResearch 运算符优先级 | bug | 2026-05-04 |
| 21 | 修复 mock TTS WAV-as-MP3 MIME 不匹配 | bug | 2026-05-04 |
| 22 | 修复 /api/plan/today 未传 playlists | bug | 2026-05-04 |
| 23 | 为 DeepSeek 和 MiMo adapter 添加请求超时 | bug | 2026-05-04 |
| 24 | Web research 结果按 episode 缓存 | bug | 2026-05-04 |

## Issue 目录

所有 issue 位于 `.scratch/code-review/issues/`，编号 01–25。

**第三次审查新增（2026-05-06）**

| Issue | 标题 | 类型 | 来源 |
|-------|------|------|------|
| 25 | 统一 Asia/Shanghai 时区契约，修复日期显示和归档偏移 | bug | 用户反馈“时区显示还是不对” |

## 执行建议

- Issue 01 和 02 互相独立，可以并行执行。
- Issue 03 应在 01 之前完成，因为它修改的是 adapter 层，与 01 的拆分范围不重叠。
- Issue 10 修改 shared 包，可能影响 server 和 web，建议单独执行。
- **第二次审查的紧急 issue（#20-24）建议优先处理**：#23 超时缺失会导致真实 API 挂起令服务不可用，#22 和 #21 是数据/行为不一致问题。
- 其余 issue 互相独立，可以按优先级顺序执行。
