# FakeRadio 播放器皮肤集成

## 背景

FakeRadio-frontend 项目已有 5 套播放器皮肤（amber/pixel/terminal/bento/y2k），需要集成到主项目中，替换旧的 terminal-fm/morning-console 主题，并新增 SSE 流式聊天和主题切换面板。

## 已完成

| Issue | 标题 | 状态 |
|-------|------|------|
| 01 | 后端 SSE 聊天端点 + useChatSSE hook | completed |
| 02 | useRadioBridge hook + skin-config | completed |
| 03 | 5 套皮肤组件（amber/pixel/terminal/bento/y2k） | completed |
| 04 | 皮肤 CSS（集中化管理，`.fr-*` 前缀） | completed |
| 05 | player-shell.tsx 集成 + player-view-model.ts 扩展 | completed |
| 06 | layout.tsx 字体加载（Cardo、Noto Serif SC、JetBrains Mono） | completed |
| 07 | 代码审查修复（7 个 bug） | completed |

## 关键文件

- `server/src/http/chat-sse-handler.ts` — SSE 流式聊天 handler
- `apps/web/src/features/player/use-chat-sse.ts` — SSE 连接管理 hook
- `apps/web/src/features/player/use-radio-bridge.ts` — 状态桥接 hook
- `apps/web/src/features/player/skin-config.ts` — 皮肤 + Persona 配置
- `apps/web/src/features/player/skin-stage.tsx` — 皮肤渲染 + Settings 面板
- `apps/web/src/features/player/skin-amber.tsx`、`skin-pixel.tsx`、`skin-terminal.tsx`、`skin-bento.tsx`、`skin-y2k.tsx` — 各皮肤实现
- `apps/web/src/features/player/skins.css` — 集中化皮肤 CSS（`.fr-*` 前缀）

## 合并信息

- 合并到 main：commit `487a0cf`（5 套皮肤集成）+ `6dd8556`（代码审查修复）
- 测试：369 项全部通过（web 108 + server 261）
