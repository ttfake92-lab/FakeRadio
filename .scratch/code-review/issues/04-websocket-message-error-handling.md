# 04 WebSocket 消息处理增加异常保护

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/apps/web/src/features/player/player-shell.tsx`

## What to build

WebSocket `message` 事件处理中，`StreamEventSchema.parse(JSON.parse(String(message.data)))` 没有 `try/catch` 保护。如果服务端发送了格式错误的消息，`parse` 或 `JSON.parse` 会抛出异常，可能导致 WebSocket 连接异常中断或组件崩溃。

当前代码（约 L328）：

```ts
const event = StreamEventSchema.parse(JSON.parse(String(message.data))) as StreamEvent;
```

需要包裹在 `try/catch` 中，捕获后记录 diagnostic 状态但不中断连接。

## Acceptance criteria

- [ ] WebSocket message handler 中的 `parse` 和 `JSON.parse` 调用包裹在 `try/catch` 中
- [ ] 解析失败时更新 `streamStatus` 为 `label: "warn"`，`detail` 包含错误摘要
- [ ] 解析失败不关闭 WebSocket 连接
- [ ] 新增测试覆盖格式错误消息的处理路径

## Blocked by

None — can start immediately

## Verification

手动在 browser console 中通过 WebSocket 发送非法消息，验证连接不中断且 UI 显示警告。

## Comments

- `StreamEventSchema` 本身是 Zod schema，`parse` 在失败时会抛出 `ZodError`。
