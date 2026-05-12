# 07 可折叠 Production Board 与生成控制台 UI

Status: needs-triage

## Parent

`.scratch/fakeradio-show-production/PRD.md`

## What to build

在默认竖屏主界面保持“上方监听台 + 下方 LLM/DJ 聊天区”的心智，同时提供可折叠 / 可关闭的 Production Board、Generation Console、Render / Export Queue 和 Settings 入口。Production Board 展示 show -> block -> episode 三层，默认展开 block；Generation Console 以日志流为主、结构化时间线为辅。

## Acceptance criteria

- [ ] 默认主界面仍以监听台和聊天区为主，不默认铺开制作后台。
- [ ] Production Board、Generation Console、Render / Export Queue、Settings 均可折叠 / 关闭。
- [ ] LLM 可以在聊天中建议打开面板，但不自动抢占主界面。
- [ ] Production Board 显示 Show、Block、Episode 三层，默认只展开 Block。
- [ ] Generation Console 默认显示制作台日志和技术 trace 摘要，可按阶段过滤或折叠。
- [ ] 五套主题共享同一套功能 contract，不各自发明信息架构。
- [ ] 小窗、手机竖屏、较宽桌面均通过浏览器验收。

## Blocked by

- `.scratch/fakeradio-show-production/issues/03-background-job-and-generation-log-stream.md`
- `.scratch/fakeradio-show-production/issues/05-show-project-storage.md`

## Type

HITL

## Comments

标为 HITL 是因为它需要人工确认默认主窗口是否仍然保持克制。视觉实现必须尊重现有五套主题，但不要把工具面板做成五套不同产品。

