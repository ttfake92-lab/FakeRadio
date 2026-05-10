# 01 - 预热状态骨架与前端可见入口

Status: needs-triage

## What to build

建立每日节目预热的最小可观测闭环：本地 server 能持久化 prepared episode 的基础状态，暴露 `GET /api/prewarm/status`，PWA 播放器能以低干扰方式显示“节目准备中 / 已准备 / 失败”的基本状态。这个 slice 不要求真正夜间生成 episode，只先打通状态 contract、SQLite 表和前端入口。

## Acceptance criteria

- [ ] `packages/shared` 定义 prewarm status response schema，包含 enabled、targetDate、lastRun、blocks、nextRunAt 等字段。
- [ ] `StateRepository` 初始化 prepared episode 相关表结构，并能统计指定 radio date 的 ready、consumed、failed 数量。
- [ ] `GET /api/prewarm/status` 返回 schema 校验后的状态；无预热数据时返回空状态而不是 500。
- [ ] PWA 增加一个低干扰入口或状态徽章，能展示预热状态摘要。
- [ ] 覆盖 repository、route 和前端 view-model 的基础测试。

## Blocked by

None - can start immediately

## Comments

