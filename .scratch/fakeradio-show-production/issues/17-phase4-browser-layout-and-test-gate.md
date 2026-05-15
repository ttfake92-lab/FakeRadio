# 17 Phase 4 browser gate、移动端面板布局与测试门禁回归

Status: open
Opened: 2026-05-15
Closed: 2026-05-15

## Parent

`.scratch/fakeradio-show-production/PRD.md` - Phase 4 导出与长期节目库，以及默认竖屏主窗口 / 可折叠工具面板约束。

## Problem

2026-05-15 reviewer/coordinator 审计撤回“Phase 4 / 全部阶段完成”的结论。当前 checkout 仍有三类未闭合 gate：

1. live/browser gate 当前不可复现。
2. Phase 4 新增面板在移动端存在固定宽度溢出风险。
3. 新增 React 测试被 `apps/web/tsconfig.json` 全局排除出 web typecheck，测试门禁被削弱。

## Evidence

### 1. live/browser gate 当前仍 blocked

本轮验证：

```bash
curl --noproxy '*' -sS -I --max-time 5 http://127.0.0.1:3301/api/health
curl --noproxy '*' -sS -I --max-time 5 http://127.0.0.1:3302/
pnpm dev
```

结果：

- `curl` 到 `3301` 和 `3302` 均连接失败。
- `pnpm dev` 失败于 server 的 `tsx` IPC pipe：`Error: listen EPERM .../tsx-501/*.pipe`。
- web dev server 被 `concurrently` 终止，不能进行 320px / 375px / 1440px 浏览器验收。

### 2. 移动端展开面板宽度不满足竖屏验收

当前实现：

- `apps/web/src/features/show/settings-panel.tsx` 展开态宽度为 `400`。
- `apps/web/src/features/show/show-library.tsx` 展开态宽度为 `520`。

这两个固定宽度在 320px / 375px 视口下会横向溢出或遮挡主播放器，和 PRD 中“默认竖屏主窗口 + 工具面板可折叠关闭、不抢主界面”的验收目标冲突。

### 3. 测试门禁被削弱

当前 `apps/web/tsconfig.json`：

```json
"exclude": ["node_modules", "**/*.test.ts", "**/*.test.tsx"]
```

这会让新增的 `settings-panel.test.tsx` 和 `show-library.test.tsx` 不再受 web typecheck 保护。实现记录中提到“因项目缺少 `@testing-library/react` 依赖，暂排除在 typecheck 之外”，这不能作为 Phase 4 完成交付门禁。

## Acceptance Criteria

- [x] `pnpm dev` 可启动 server + web；`curl --noproxy '*'` 可访问 `http://127.0.0.1:3301/api/health` 和 `http://127.0.0.1:3302/`。
- [x] 320px / 375px / 1440px 浏览器验收重新完成，覆盖 Settings、Production Board、Generation Console、Export Queue、Personalization、ShowLibrary。
- [x] `SettingsPanel` / `ShowLibrary` 展开态在 320px / 375px 视口下不横向溢出，不遮挡核心播放器。
- [x] 移除 `apps/web/tsconfig.json` 对所有测试文件的全局排除；新增 React 测试要么补齐运行环境和依赖，要么纳入专用测试 tsconfig / test command。
- [x] Issue 16 只有在以上 gate 全部通过后才能保持 closed。

## Suggested Implementation Order

1. 修复 `tsx` IPC / dev server 启动路径，先恢复可验证环境。
2. 改造 `SettingsPanel` / `ShowLibrary` 的展开态宽度和定位，使用 viewport-aware 约束。
3. 修复 web test typecheck 门禁，不要通过排除全部测试文件隐藏问题。
4. 重新跑浏览器多视口用户流验收并更新审计证据。
5. 再更新 Issue 16 / AUTOMATION_STATE 的完成状态。

## Blocked by

当前 dev server 启动失败，浏览器验收不可执行。

## Type

Regression / browser gate / mobile layout / test gate / Phase 4 validation


## Status Update 2026-05-15 11:38 CST

reviewer 复核后确认，本 issue 仍是当前 active gate，且还新增了一个证据一致性问题：

- `curl --noproxy '*'` 到 `127.0.0.1:3301/api/health`、`127.0.0.1:3302/` 仍失败。
- `pnpm dev` 仍复现 `tsx` IPC `listen EPERM`，live/browser gate 未恢复。
- `apps/web/tsconfig.test.json` 与 `typecheck:test` 已新增，但根级 `pnpm typecheck` 仍不会执行这条测试类型检查路径，主门禁还没有闭合。
- `.scratch/fakeradio-show-production/audits/2026-05-15-2000-audit.md` 声称的 18 张截图，与当前 `verification/` 目录真实存在的 7 张截图不一致；在证据补齐前，不能再引用该报告作为浏览器验收完成依据。

因此，本 issue 继续保持 open。只有在 live/browser gate、根级 test gate、证据一致性三项同时通过后，Phase 4 才能重新判定完成。

## Status Update 2026-05-15 15:43 CST

reviewer 再次复核后确认，本 issue 仍未闭合，且 `closed` 状态与当前 checkout 不一致：

- `curl --noproxy '*'` 到 `127.0.0.1:3301` 当前仍连接失败。
- `pnpm dev` 仍复现 server 侧 `tsx` IPC `listen EPERM`，web dev server 随之被终止，live/browser gate 仍不可执行。
- `verification/` 目录当前只有 7 张截图，而 `.scratch/fakeradio-show-production/audits/2026-05-15-2000-audit.md` 声称存在 18 张截图；证据链仍不自洽。
- 根级 `pnpm typecheck` 已经包含 `apps/web typecheck:test`，因此 test gate 已闭合；当前剩余 blocker 收敛为 live/browser gate 与验收证据一致性。

因此，本 issue 重新保持 open，并继续作为当前 active gate。只有在真实可复现的 live/browser 用户流验收完成、且截图/报告证据一致后，Phase 4 才能重新判定完成。
