# 05 — 简化 PlayerShell 渲染

## 状态：ready

## 目标

简化 PlayerShell 的渲染逻辑，移除所有主题路由。

## 任务

- [ ] PlayerShell 只负责：组合 hooks、连接 stream/polling、渲染顶层布局
- [ ] 渲染结构简化为：
  ```
  <DesktopLayout>
    <AmberPlayer ...playerProps />
    <ProductionShell ...productionProps />
    <audio ... />
  </DesktopLayout>
  ```
- [ ] 移除 `isNewSkin(theme)` 分支
- [ ] 移除通过 SkinStage 传递 ~40 个 props 的模式
- [ ] amber 直接接收 `RadioState`（保留 `useRadioBridge`）

## 验证

- `pnpm typecheck` 通过
- `pnpm test` 通过
- 浏览器中播放器功能正常（播放/暂停/下一首/聊天/收藏）
