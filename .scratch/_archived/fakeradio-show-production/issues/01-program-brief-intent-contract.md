# 01 ProgramBrief 制作意图 contract 与解析入口

Status: done

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

建立 `ProgramBrief` 作为用户制作意图的持久化 contract，并让聊天入口能区分"制作一期主题节目""某个时段想听某主题""普通闲聊 / 品味表达"。完成后，用户说"帮我做一期围绕 Bee Gees 的主题节目"会创建整期主题 Brief；说"今晚想听 Bee Gees 相关的东西"会创建 block 级 Brief；普通表达只进入 memory / taste。

## Acceptance criteria

- [x] shared contract 中定义并测试 `ProgramBrief` schema，覆盖 `theme-show`、`block-theme`、`daily-show`。
- [x] server 能持久化 Brief，并通过最小 API 返回当前 Brief 列表与详情。
- [x] `/api/chat` 或等价 intent 入口能解析明确制作意图并创建 Brief。
- [x] 弱表达不创建 Brief，只保持现有聊天 / taste / session 语义。
- [x] Agent 回复包含轻量确认，并提示用户可以继续追加约束。
- [x] 测试覆盖整期主题、block 主题、闲聊、品味更新四类输入。

## Blocked by

None - can start immediately

## Type

AFK

## Comments

2026-05-12: 已完成实现。

### 实现内容

1. **Contract 定义** (`packages/shared/src/contracts/radio.ts`)
   - `ProgramBriefSchema` 及相关类型：`ProgramBriefType`, `ProgramBriefScope`, `ProgramBriefPriority`, `ProgramBriefStatus`, `ProgramBriefConstraints`
   - `ChatResponseSchema` 扩展支持 `brief` 字段
   - `BriefsListResponseSchema`, `BriefResponseSchema` 用于 API 响应

2. **Repository 实现** (`server/src/show/program-brief-repository.ts`)
   - 基于 SQLite 的持久化存储 (`briefs.db`)
   - 支持 save, get, list, updateStatus, delete 操作
   - 支持按 status, type, targetDate 过滤

3. **Intent Parser** (`server/src/show/brief-intent-parser.ts`)
   - `parseBriefIntent`: 解析用户消息，识别 theme-show 和 block-theme 意图
   - `createBriefFromIntent`: 从解析结果创建 ProgramBrief

4. **API Routes** (`server/src/http/register-routes.ts`)
   - `GET /api/briefs`: 列出所有 briefs
   - `GET /api/briefs/:id`: 获取单个 brief

5. **Chat Intent Router** (`server/src/http/chat-intent-router.ts`)
   - 在 next-track intent 之前添加 brief intent 处理
   - 创建 brief 后返回轻量确认消息

### 测试覆盖

- `packages/shared/src/contracts/radio.test.ts`: ProgramBrief schema 测试
- `server/src/show/program-brief-repository.test.ts`: Repository CRUD 测试
- `server/src/show/brief-intent-parser.test.ts`: Intent parser 测试
- `server/src/http/create-server.test.ts`: 集成测试（6 个测试用例）

### 验证命令

```bash
pnpm vitest run packages/shared/src/contracts/radio.test.ts server/src/show/program-brief-repository.test.ts server/src/show/brief-intent-parser.test.ts server/src/http/create-server.test.ts -t "brief"
pnpm test
pnpm typecheck
```

全部 421 个测试通过，typecheck 通过。

