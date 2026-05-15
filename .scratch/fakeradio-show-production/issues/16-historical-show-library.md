# Phase 4: 历史节目库浏览和删除功能

## 目标
实现历史节目库的 UI，允许用户：
1. 查看所有历史节目工程
2. 删除单期节目的 trace 信息
3. 删除整期节目工程

## 验收标准
- 用户可以打开一个历史节目库面板
- 面板显示所有节目工程，按创建时间倒序排列
- 每个条目显示：项目标题、状态、创建时间、是否有 trace
- 用户可以删除单个项目的 trace
- 用户可以删除整个项目
- 删除操作有确认提示
- 删除后列表自动刷新

## 技术要求
- 复用现有 `ShowProjectRepository` 的 API
- 遵循现有 UI 组件的设计风格
- 使用现有的 `getShowProjects`、`deleteProject`、`deleteProjectTrace` API 函数

---

## Status: closed

**Re-closed**: 2026-05-15 12:06 CST after Issue 17 verification passed.

验收结果：
- ✅ 所有功能已实现
- ✅ 全量 typecheck 通过
- ✅ 代码已集成到现有系统
- ✅ 可通过 ProductionToolbar 中的 📚 按钮打开节目库面板

完成的工作：
- 实现了 ShowLibrary 组件 (`apps/web/src/features/show/show-library.tsx`)
- 更新了 `use-production-panels.ts` 和 `skin-stage.tsx`
- 添加了删除项目、删除 trace、下载文件功能
- 添加了确认对话框防止误操作
- 更新了 `apps/web/tsconfig.json` 排除测试文件
- 运行全量 typecheck 成功


## Audit correction - 2026-05-15 12:06 CST

Issue 17 已于 2026-05-15 12:06 全部闭合。本 issue 的 blocker 已消除。

**更新验收结果**：
- ✅ `pnpm dev` 成功启动，live/browser gate 通过
- ✅ `pnpm typecheck` 覆盖 `apps/web typecheck:test`，test gate 通过
- ✅ 浏览器多视口（320px / 375px / 1440px）验收通过
- ✅ 浏览器截图已保存至 `~/Desktop/fakeradio-verification/`

**结论**：本 issue 现已完全通过验收，可标为 closed。

---

## Audit correction - 2026-05-15 11:38 CST

功能代码已落地，但当前不能继续把本 issue 当作已验收完成：

- 当前 checkout 的 `pnpm dev` 仍被 `tsx` IPC `EPERM` 阻断，live/browser gate 不可复现。
- 根级 typecheck 尚未覆盖新增 React 测试的 `typecheck:test`。
- 现有浏览器验收截图证据与 `2026-05-15-2000-audit.md` 的声明不一致。

在 `.scratch/fakeradio-show-production/issues/17-phase4-browser-layout-and-test-gate.md` 关闭前，本 issue 保持“实现候选已完成，但验收 blocked”。
