# Glass Radio Console 视觉改造计划

## Summary

将当前 `On Air` 页面从“终端/像素电台”改为 **Glass Radio Console**：保留 `9:16` 常驻面板和现有播放/DJ 数据流，但重做视觉系统为暗色玻璃拟态、柔光卡片、高级控制台质感。实现只改前端展示层，不改 server、adapter、shared contract。

当前已有 `OnAirTerminal` 组件和 `on-air-*` CSS。实施时不要继续微调旧像素风，而是整体替换 On Air 视觉 token、背景、层级、字体和卡片材质。

## Key Changes

- 保留结构：
  - `9:16` 面板比例
  - 顶部品牌栏
  - 时间 / On Air 区
  - Now Playing 控制带
  - Queue 摘要
  - AI DJ 区
  - 底部 DJ 输入栏
  - 底部连接状态

- 替换风格：
  - 背景：深黑蓝底 + 紫蓝/青色柔光 + 细噪点，不再使用明显点阵终端背景。
  - 面板：半透明玻璃卡片、内发光边框、柔和阴影、轻微 backdrop blur。
  - 字体：整体从 monospace 主导改为现代 sans 主导；只在小状态标签保留少量 mono 气质。
  - 时间区：大号时间保留，但改成柔和 luminous display，不再像像素终端。
  - DJ 消息：从黑色硬边气泡改为玻璃消息卡，文字更轻、更像高级通知中心。
  - 控件：播放按钮改成低对比圆形玻璃按钮，减少边框噪音。
  - Queue / footer：弱化为状态带，不要抢主视觉。

- 主题处理：
  - `terminal-fm` 的视觉实现改为 `Glass Radio Console` 默认深色主题。
  - `morning-console` 仍保留为暖色低刺激变体，但使用同一 glass system：暖雾背景、柔和琥珀/薄荷高光、低对比玻璃卡。
  - 不新增主题 ID，避免改 view-model 测试和业务逻辑；只重定义两个现有主题的视觉。

## Implementation Changes

- `apps/web/src/app/globals.css`
  - 重写 `.on-air-stage`、`.on-air-panel`、`.theme-terminal-fm`、`.theme-morning-console` 和所有 `.on-air-*` 子区块样式。
  - 删除或覆盖当前强烈点阵、终端、硬黑块、过多 monospace 的视觉语言。
  - 增加玻璃系统变量，例如：
    - `--glass-bg`
    - `--glass-panel`
    - `--glass-border`
    - `--glass-highlight`
    - `--glass-muted`
    - `--glass-glow`
  - 使用 `::before` / `::after` 做柔光和细噪点，但不得影响交互层。
  - 保持 `aspect-ratio: 9 / 16` 与当前自适应宽度公式。
  - 修正文字比例：所有字体必须面向真实手机 UI，不使用示意图级超大字号。

- `apps/web/src/features/player/on-air-terminal.tsx`
  - 尽量少改结构。
  - 允许小幅调整 className 分组以支持玻璃层级，例如给时间区、播放带、DJ 卡增加内部 wrapper。
  - 顶部 `DARK / LIGHT` 文案可以保留，但视觉上变成小型 segmented glass toggle。
  - `on-air-clock-marker` 可改成抽象 signal glyph 或隐藏，避免保留像素终端味太重。

- `apps/web/src/features/player/player-shell.tsx`
  - 不改数据流。
  - 不改播放、收藏、聊天 handler。
  - 不改主题选择逻辑：Morning 时段继续使用 `morning-console`，其他时段使用 `terminal-fm`。

## Visual Acceptance Criteria

- 默认页面第一眼应接近用户给的参考图气质：深色、玻璃、柔光、精致卡片，而不是终端窗口。
- `9:16` 面板仍是唯一主舞台，不能变成普通网页卡片网格。
- 顶部品牌栏不拥挤，`FakeRadio` 和状态按钮都完整显示。
- 时间区醒目但不过度巨大，不能像 mockup 大字比例。
- DJ 区像一张高级通知/消息玻璃卡，不是黑色代码块。
- 播放控件存在但低调，不能重新变成传统播放器主视觉。
- `Morning Console` 与默认主题结构一致，但呈现暖色、低刺激、晨间质感。

## Test Plan

- 静态检查：
  - `pnpm --filter @fakeradio/web typecheck`
  - `pnpm --filter @fakeradio/web test -- player-view-model.test.ts`

- Browser 视觉验证：
  - Desktop viewport：确认面板居中，玻璃背景和柔光层级正确。
  - Mobile `390x844`：确认面板保持 `9:16`，顶部不裁切，底部输入可见。
  - Floating `360x640`：确认不拉伸、不重叠，文字比例仍然可读。
  - 强制测试两个主题：
    - `terminal-fm`：深色 Glass Radio Console。
    - `morning-console`：暖色 glass 变体。
  - 检查长 DJ 文案：消息卡内部滚动或自然收纳，不破坏外层比例。

## Assumptions

- 本轮是视觉改造，不重新设计 IA，不新增页面。
- 保留现有 `OnAirTerminal` 和 `PlayerShell` 数据接口，避免扩大改动面。
- 参考图只作为风格方向：玻璃、柔光、暗色高级感；不照搬通知中心的网格布局。
- 当前未提交的 `globals.css` 字号调整可被新 glass CSS 覆盖或替换，不需要保留旧像素终端视觉。
