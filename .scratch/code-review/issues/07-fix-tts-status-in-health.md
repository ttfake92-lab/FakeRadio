# 07 修复 /api/health 中 TTS 状态判断逻辑

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

health 接口中 TTS 状态的判断逻辑是反的：

```ts
tts: options.ttsAdapter ? "mock" : "ready",
```

当外部注入了 `ttsAdapter` 时返回 `"mock"`，未注入时返回 `"ready"`（但实际走的是 Edge TTS）。正确逻辑应该是：

- 外部注入 `ttsAdapter` → 应该返回 `"mock"`（因为测试中注入的是 mock adapter）✓
- 未注入 → 应该返回 `"ready"`（默认使用 Edge TTS）✓

实际上这个逻辑碰巧是对的（因为测试注入 mock，生产不注入），但代码可读性很差。建议改为显式的 adapter 类型标记：

```ts
tts: options.ttsAdapter ? "mock" : "ready",
```

应该重构为在 adapter 创建时记录 status，类似 `musicAdapterResult` 的模式。

## Acceptance criteria

- [ ] TTS adapter status 通过显式标记传递，而非隐式推断
- [ ] health 接口返回的 TTS 状态与实际使用的 adapter 一致
- [ ] 测试注入 mock adapter 时 health 返回 `"mock"`
- [ ] 生产环境使用 Edge TTS 时 health 返回 `"ready"`
- [ ] 现有 create-server 测试继续通过（34 个测试）

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 可以参考 `createMusicAdapter` 返回 `{ music, status }` 的模式，让 TTS adapter 创建也返回类似结构。
