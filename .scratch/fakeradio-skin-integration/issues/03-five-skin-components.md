Status: completed

## Parent

- `.scratch/fakeradio-skin-integration/PRD.md`

## What to build

新增 5 套皮肤组件，通过 `.fr-*` CSS 前缀实现样式隔离。

新增文件：
- `apps/web/src/features/player/skin-amber.tsx` — 暖橙胶片皮肤
- `apps/web/src/features/player/skin-pixel.tsx` — 像素 Game Boy 皮肤
- `apps/web/src/features/player/skin-terminal.tsx` — 终端 TUI 皮肤
- `apps/web/src/features/player/skin-bento.tsx` — Bento 玻璃皮肤
- `apps/web/src/features/player/skin-y2k.tsx` — Y2K/Win98 皮肤
- `apps/web/src/features/player/skin-stage.tsx` — 皮肤渲染 + Settings 面板

## 皮肤组件接口

所有皮肤组件接收：`{ r: RadioState, persona, avatarSrc, onAvatarClick }`。
气泡 action（fav/more/less/copy）通过 `onBubbleAction(kind, msg)` 触发。
