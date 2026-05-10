# 26 拆分 register-routes.ts 和 /api/chat intent 路由

Status: completed
Type: refactor

## Parent

- 代码审查：`FakeRadio/server/src/http/register-routes.ts`（573 行）

## What to build

Issue #01 已将 `create-server.ts` 拆分为 `playback-state.ts`、`episode-runner.ts` 和 `register-routes.ts`。但 `register-routes.ts` 现在是 573 行，承担了所有路由注册和业务逻辑。其中 `/api/chat` 单独就有 ~200 行，包含 8 个 intent 分支（next-track、add-favorite、export-episode、update-taste、story-background、personal-memory、infer-taste、default LLM chat），每个分支都独立构建 `computeDjDecision` 的输入。

问题：

1. **`/api/chat` handler 是新的 god function**：8 个 intent 分支的 regex 匹配、上下文构建和 LLM 调用全部内联。
2. **`computeDjDecision` 调用重复 4 次**（L249、L288、L320、L391），每次都构造几乎相同的 `BuildContextInput`，只有 `systemPrompt` 和 `userMessage` 不同。
3. **mock 环境硬编码在 4 处**：`weather: { summary: "mock weather", moodHint: "mock" }`、`calendar`、`devices` 重复出现。
4. **`readTaste(process.cwd())` / `writeTaste(process.cwd(), ...)` 出现 6 次**，直接依赖进程工作目录而非注入的配置。

建议：

1. 提取 `createChatIntentRouter(deps)` 模块，将 intent 分支移入独立函数。
2. 提取 `buildChatContext(deps, userMessage, systemPrompt?)` 函数，统一 `computeDjDecision` 的输入构建。
3. `process.cwd()` 改为注入 `baseDir` 参数（可复用 `loadUserPreferences` 已有的 `baseDir`）。
4. 提取 `inferAndSaveTaste(deps, llm, userMessage)` 函数，复用于 `/api/chat`（infer-taste intent）和 `/api/taste/infer`。

## Acceptance criteria

- [ ] `register-routes.ts` 缩减到 300 行以内
- [ ] `/api/chat` 的 intent 分支提取到独立模块
- [ ] `computeDjDecision` 的输入构建不再重复 4 次
- [ ] `readTaste` / `writeTaste` 不再直接使用 `process.cwd()`
- [ ] 所有 275 个测试继续通过
- [ ] 新增对 intent router 的单元测试

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
pnpm run typecheck
```
