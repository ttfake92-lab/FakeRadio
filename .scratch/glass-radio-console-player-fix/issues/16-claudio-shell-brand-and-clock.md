# 对齐 Claudio 外壳、品牌栏与大号时间区

Status: ready-for-agent
Type: AFK

## What to build

把当前窄 `FakeRadio` 小面板改成接近参考图的 Claudio 播放器外壳：更宽的竖向终端、顶部头像 + 大号点阵 `Claudio` 品牌、右侧 `LOGIN / DARK / LIGHT` 分段入口，以及占据首屏视觉中心的大号点阵时间区。

这一步先解决“第一眼不像参考图”的问题，不处理 DJ room 细节。

## Acceptance criteria

- [ ] 顶部品牌显示为 `Claudio`，左侧有圆形头像或稳定占位头像，品牌字号明显大于当前 `FakeRadio` 小字。
- [ ] 顶部右侧显示 `LOGIN`、`DARK`、`LIGHT`，其中当前主题有明确选中态；不再只显示 `THEME` 单按钮。
- [ ] 面板宽度从当前手机壳感扩大为参考图播放器感，桌面端不应窄到像聊天浮窗。
- [ ] 时钟区使用大号点阵风格，时间是首屏最强视觉重心。
- [ ] 时钟区背景是黑色点阵/网格，不是轻玻璃卡片。
- [ ] 星期、日期、`ON AIR` 与当前 mode 保持可读，层级低于时间。
- [ ] 移动竖屏下外壳不横向溢出。

## Blocked by

- `.scratch/glass-radio-console-player-fix/issues/15-fix-clock-hydration-and-reference-state.md`

