# FakeRadio 本地集成收尾计划

## Summary
- 不直接把 `worktree-personal-recommendation` merge 回 `main`；当前仓库已经在 `main`，且该 worktree 分支相对当前 `main` 会删除/回退一些现有文件，适合当作参考来源，不适合整支合并。
- 以当前 `/Users/tt/projects/FakeRadio` 的 `main` 工作区作为本地集成目标：保留已验证通过的歌单结构化、收藏诊断、候选选择、LLM 串歌防错和端到端播放闭环。
- 本轮只做本地整理与本地 commit；不 push、不删 worktree、不改远端分支。

## Key Changes
- 建立一个本地集成提交，纳入当前已通过 `pnpm test && pnpm typecheck` 的源码、测试、issue/docs 变更。
- 明确排除本地私有/运行态文件：`user/网易云歌单.md`、`user/netease-liked-songs*.json`、`user/favorites.json`、`user/sessions/`、`user/secrets/`、`.claude/`、`.cursor/`、临时 `test-netease*.js` 和 scratch 下载包。
- 添加或补齐 ignore 规则，让歌单原始文件、结构化输出、会话运行态以后继续留在本地，不污染 git 状态。
- 保留现有 public API 形态：`/api/favorites/diagnostics` 继续用于收藏库加载诊断，`/api/next` 继续作为端到端播放入口；本次收尾不引入新的外部接口契约。

## Implementation Steps
- 先停止当前 dev screen，避免最终整理时产生新的 `user/sessions` 运行态变化；完成后再按需重启 `pnpm dev`。
- 做一次文件归类：源码、测试、文档、issue tracker 纳入 commit；个人歌单、结构化歌单、运行日志、临时脚本保持 untracked 或 ignored。
- 在 `main` 上创建本地集成 commit，commit message 使用中文或英文均可，建议：`chore: stabilize local personal recommendation flow`。
- 对 `worktree-personal-recommendation` 只做差异核对，不做 merge；如发现当前 `main` 缺少该分支某个必要修复，只 cherry-pick 单个提交或手工移植对应变更。

## Test Plan
- 运行 `pnpm test && pnpm typecheck`，要求全部通过。
- 启动 `pnpm dev` 后检查：
  - `GET /api/health` 返回 ready。
  - `GET /api/favorites/diagnostics` 显示歌单已加载，数量为本地结构化结果。
  - 浏览器端点击生成下一首后，当前歌曲标题/歌手与 DJ 串词一致。
- 最终确认 `git status` 中只剩被刻意保留的本地私有文件，或完全 clean。

## Assumptions
- “并本地”理解为本地集成和本地提交，不包含 push 到 `origin/main`。
- 用户歌单和结构化结果默认视为个人数据，不提交进仓库。
- 当前 `main` 上已有的 7 个 ahead commits 保留不改，本轮只整理当前 dirty worktree。
