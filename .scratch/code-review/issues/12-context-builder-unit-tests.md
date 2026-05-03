# 12 为 buildContextWindow 补充独立单元测试

Status: ready-for-agent
Type: test

## Parent

- 代码审查：`FakeRadio/server/src/context/context-builder.ts`

## What to build

`context-builder.ts` 有实现和测试文件（`context-builder.test.ts`），但测试覆盖可能不够充分。当前 `dj-brain.test.ts` 间接覆盖了部分逻辑。

需要确认并补充以下场景的测试：

1. fragment 优先级排序是否正确（system=1, user=2, environment=3, memory=4, request=5, execution=6）
2. `formatWeather` 中 `temperatureC` 为 `undefined` 时不包含温度信息
3. `formatCalendar` 空数组时返回空字符串
4. `formatDevices` 中设备状态拼接
5. `userMessage` 为 `undefined` 时 `request` fragment 的 `message:` 后为空

## Acceptance criteria

- [ ] `context-builder.test.ts` 覆盖上述 5 个场景
- [ ] 测试验证 fragment 的 `id`、`label`、`priority`、`source` 字段
- [ ] 所有 context builder 测试通过

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- 当前已有 3 个 context builder 测试，确认是否已覆盖上述场景，补充缺失的即可。
