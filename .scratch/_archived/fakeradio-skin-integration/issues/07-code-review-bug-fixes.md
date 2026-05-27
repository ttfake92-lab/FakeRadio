Status: completed

## Parent

- `.scratch/fakeradio-skin-integration/PRD.md`

## What to build

代码审查发现的 7 个 bug 修复：

1. `use-radio-bridge.ts`：非 null 断言 → 显式检查 + 抛错
2. `skin-pixel.tsx`：`PxBubble.onLong` 签名改为 `onLong(kind, msg)`，支持所有 bubble action
3. `skin-y2k.tsx`：Win 拖拽 closure 用 `posRef` 替代直接捕获 state，避免 re-render 时坐标过时
4. `skin-terminal.tsx`：补缺失的 `ChatMessage` 类型导入
5. `skin-y2k.tsx`：Win 组件 onClose 按钮绑定实际回调
6. `skin-stage.tsx`：删除死代码 `fileInputRef`
7. `skin-stage.tsx`：`tag.split(" · ")[1]` 添加 `?? p.tag` fallback

## Verification

```bash
pnpm --filter web build 2>&1 | tail -5
```
