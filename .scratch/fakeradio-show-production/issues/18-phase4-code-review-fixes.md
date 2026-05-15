# 18 Phase 4 代码审查修复

Status: open
Opened: 2026-05-15

## Parent

Issue 14, 15, 16, 17 - Phase 4 完成后的代码审查

## Problem

Phase 4 (`44e01df`) 代码审查发现 5 个重要问题和 3 个次要问题，需要在合并前或下一迭代中修复。

## Issues

### Important

1. **CSS layout 冲突：`left`/`right` 和 `width` 同时设置**
   - 文件：`apps/web/src/features/show/settings-panel.tsx` (~L180)
   - 文件：`apps/web/src/features/show/show-library.tsx` (~L220)
   - 问题：同时设置 `position: "fixed", left: 16, right: 16` 和 `width`，CSS 规范下行为 undefined，目前靠浏览器容错。
   - 修复：二选一——① 固定宽度居中 `left: "50%", transform: "translateX(-50%)", width: "min(...)"` 去掉 `right`；② 或去掉 `width` 改用 `maxWidth`。

2. **TextSetting 每按键都发 API，无 debounce**
   - 文件：`apps/web/src/features/show/settings-panel.tsx` (`TextSetting` 的 `onChange`)
   - 问题：每次 `input` 事件都触发 `updateSettings()` API 调用，造成多余网络负载、竞态风险、输入卡顿。
   - 修复：加 300ms debounce，或用 `onBlur` 代替 `onChange`。

3. **下载逻辑重复**
   - 文件：`apps/web/src/features/show/show-library.tsx` (`handleDownload`)
   - 问题：Blob、URL、anchor、click、cleanup 逻辑在单文件和 zip 分支中重复写了两遍。
   - 修复：提取 `downloadBlob(blob: Blob, filename: string)` 到 `apps/web/src/lib/`。

4. **错误静默吞掉**
   - 文件：`apps/web/src/features/player/player-shell.tsx` (`handleProjectsChanged`)
   - 问题：`catch { /* Ignore errors for now */ }`，`getShowProjects()` 失败时列表停止更新且无反馈。
   - 修复：至少 `console.error`，更好是 toast 提示或重试一次。

5. **测试选择器脆弱**
   - 文件：`show-library.test.tsx`、`settings-panel.test.tsx`
   - 问题：用 `getByText("↻")`、`getByText("✕")` 选择 icon-only 按钮，换图标测试就挂。
   - 修复：给按钮加 `aria-label="刷新"` 等，测试改用 `getByRole("button", { name: "刷新" })`。

### Minor

6. **ShowLibrary 每次渲染都排序**
   - 文件：`show-library.tsx`
   - 修复：`useMemo(() => [...projects].sort(...), [projects])`

7. **`activeJob` 状态数组内联**
   - 文件：`skin-stage.tsx`
   - 修复：提取 `const ACTIVE_JOB_STATUSES = ["pending", "running", "paused", "needs-replan"]`

8. **缺少 `key` prop 防御性处理**
   - 当前假设 `project.id` 唯一，若后端保证则无需修改。

## Recommendations

- 添加共享 `useDebounce` hook
- 标准化 icon-only 按钮可访问性（统一 `aria-label`）
- 提取 `<CollapsiblePanel>` 原语减少 SettingsPanel / ShowLibrary 重复
- 为 multi-brief 隔离模式写简短注释/ADR

## Next Action

- [ ] 修复 Issue 1（CSS layout 冲突）
- [ ] 修复 Issue 2（debounce）
- [ ] 修复 Issue 3（下载逻辑提取）
- [ ] 修复 Issue 4（错误处理）
- [ ] 修复 Issue 5（测试选择器）
- [ ] 修复 Issue 6-7（次要）
- [ ] 跑测试 + typecheck 验证
