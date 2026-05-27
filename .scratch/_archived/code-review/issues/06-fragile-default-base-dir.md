# 06 修复 loadUserPreferences 中脆弱的 defaultBaseDir 回退

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/user/load-user-preference.ts`

## What to build

`defaultBaseDir()` 使用 `new URL("../../../", import.meta.url)` 推算项目根目录。这个相对路径假设了源文件在目录树中的具体位置。如果编译输出目录变化或项目结构重组，`fileURLToPath` 可能成功但指向错误目录，导致 `user/` 下的文件静默读取失败并回退到默认值。

当前代码：

```ts
function defaultBaseDir(): string {
  try {
    return resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  } catch {
    return resolve(process.cwd(), "..");
  }
}
```

建议改为：

1. 优先使用 `FAKERADIO_BASE_DIR` 环境变量（如果设置）。
2. 回退到 `process.cwd()`（server 启动目录通常是项目根目录）。
3. 移除基于 `../../` 的脆弱相对路径推算。

## Acceptance criteria

- [ ] 支持 `FAKERADIO_BASE_DIR` 环境变量覆盖
- [ ] 默认回退到 `process.cwd()`
- [ ] 移除 `new URL("../../../", import.meta.url)` 的相对路径推算
- [ ] 所有 `load-user-preference.test.ts` 测试继续通过（8 个测试）
- [ ] 新增测试覆盖环境变量覆盖场景

## Blocked by

None — can start immediately

## Verification

```bash
pnpm run test
```

## Comments

- `loadUserPreferences` 已经接受可选 `baseDir` 参数，测试中可以直接传入路径。问题只在默认值推算上。
