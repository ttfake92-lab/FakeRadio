# FakeRadio 代码审查改进计划

## 背景

2026-07-01 对 FakeRadio 全仓库进行了一次系统性代码审查，覆盖 server、web、shared 三个包。审查结果整理为 13 个可执行 issue。

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

## Issue 目录

所有 issue 位于 `.scratch/code-review/issues/`，编号 01–13。

## 执行建议

- Issue 01 和 02 互相独立，可以并行执行。
- Issue 03 应在 01 之前完成，因为它修改的是 adapter 层，与 01 的拆分范围不重叠。
- Issue 10 修改 shared 包，可能影响 server 和 web，建议单独执行。
- 其余 issue 互相独立，可以按优先级顺序执行。
