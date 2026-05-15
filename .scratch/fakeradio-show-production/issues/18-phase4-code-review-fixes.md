# 18 Phase 4 代码审查修复

Status: open
Opened: 2026-05-15

## Parent

Issue 14, 15, 16, 17 - Phase 4 完成后的代码审查

## Problem

Phase 4 (`44e01df`) 代码审查发现 5 个重要问题和 3 个次要问题，需要在合并前或下一迭代中修复。

## Issues

### Important

1. **CSS layout 冲突：`left`/`right` 和 `width` 同时设置** ✅ 已修复
   - 文件：`apps/web/src/features/show/settings-panel.tsx`、`show-library.tsx`
   - 修复：已使用 `left: "50%", transform: "translateX(-50%)"` 替代

2. **TextSetting 每按键都发 API，无 debounce** ✅ 已修复
   - 文件：`apps/web/src/features/show/settings-panel.tsx`
   - 修复：
     - 本地立即回显（`setSettings` 先调用）
     - 按字段隔离 timer（`Map<key, timer>`）
     - 关闭/卸载时清理所有 pending timer

3. **下载逻辑重复** ✅ 已修复
   - 文件：`apps/web/src/features/show/show-library.tsx`
   - 修复：提取 `downloadBlob()` 到 `apps/web/src/lib/download-blob.ts`

4. **错误静默吞掉** ✅ 已修复
   - 文件：`apps/web/src/features/player/player-shell.tsx`
   - 修复：添加 `console.error`

5. **测试选择器脆弱** ✅ 已修复
   - 文件：`show-library.test.tsx`、`settings-panel.test.tsx`
   - 修复：按钮已添加 `aria-label`，测试改用 `getByRole("button", { name: "..." })`

### Minor

6. **ShowLibrary 每次渲染都排序** ✅ 已修复
   - 文件：`show-library.tsx`
   - 修复：`useMemo` 已移动到 early return 之前，保证 hook 顺序稳定

7. **`activeJob` 状态数组内联** ✅ 已修复
   - 文件：`skin-stage.tsx`
   - 修复：提取 `const ACTIVE_JOB_STATUSES`

8. **缺少 `key` prop 防御性处理**
   - 当前假设 `project.id` 唯一，若后端保证则无需修改

## Recommendations

- 添加共享 `useDebounce` hook
- 标准化 icon-only 按钮可访问性（统一 `aria-label`）
- 提取 `<CollapsiblePanel>` 原语减少 SettingsPanel / ShowLibrary 重复
- 为 multi-brief 隔离模式写简短注释/ADR

## Next Action

- [x] 修复 Issue 1（CSS layout 冲突）✅
- [x] 修复 Issue 2（debounce）✅
- [x] 修复 Issue 3（下载逻辑提取）✅
- [x] 修复 Issue 4（错误处理）✅
- [x] 修复 Issue 5（测试选择器）✅
- [x] 修复 Issue 6（useMemo hook 顺序）✅
- [x] 修复 Issue 7（ACTIVE_JOB_STATUSES）✅
- [x] 跑测试 + typecheck 验证 ✅ (614 tests passed)

## Status Update 2026-05-15 18:14 CST

reviewer 复核当前未提交实现后，确认本 issue 仍不能关闭，且现有修复又引入了新的回归。

### 2026-05-15 18:33 CST 修复完成

reviewer 纠偏的三个问题已全部修复：

1. `ShowLibrary` 的 `useMemo` 已移到 early return 之前
2. `SettingsPanel` 文本输入立即回显 + per-field timer + cleanup 已实现
3. Issue 18 checklist 已与实现同步

## Verification

- `pnpm typecheck` ✅
- `pnpm test` (614 tests passed) ✅

## Remains Open

等待 Issue 17 live/browser gate 闭合后，方可关闭本 issue。


## Status Update 2026-05-16 00:19 CST

reviewer 复核后确认，本 issue 已完全闭合：

1. `ShowLibrary` 的所有 `useState` hooks 已移至 `if (!isOpen) return null;` 之前
2. `ExportQueue` 的 `useState` hook 已移至 early return 之前
3. 其他可折叠面板无同类问题
4. `pnpm typecheck` ✅ 通过
5. `pnpm test` ✅ 614 测试全部通过

剩余依赖：Issue 17 的 live/browser gate 验收（需先清理端口占用），验收完成后关闭本 issue。

- [ ] 将 `ShowLibrary` 的全部 hooks 移到任何 early return 之前
- [ ] 将 `ExportQueue` 的 hooks 移到任何 early return 之前
- [ ] 复核其他可折叠面板是否还有同类问题
- [ ] 完成后再与 Issue 17 一起重跑真实浏览器用户流验收
