# 08 本地运行与可观测性规范

Status: archived
Implemented: 2026-05-08
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

把 FakeRadio 的本地运行依赖、端口约定、health 语义、provider 状态诊断和常见联调路径整理成一套稳定可用的运行规范。

完成后，一个新的开发者或 agent 不需要重新猜端口、provider 地址、回退条件和检查顺序，就能独立把本地 AI 电台跑起来并知道它现在在什么模式。

## Acceptance criteria

- [ ] runbook 明确记录 FakeRadio、自身 web、本地网易云服务和关键端口约定
- [ ] health、provider 状态和回退语义在文档中有统一解释
- [ ] 遇到“真实 provider 不通”时，存在明确的本地排查路径，而不是只能靠聊天追问

## Blocked by

- `.scratch/fakeradio-v1/issues/02-real-music-source-and-fallback.md`

## Comments

- 这条 slice 主要提升可运维性和可解释性，对后续所有真实 provider 接入都有复用价值。
- 2026-05-01 implementation update:
  - `docs/local-runbook.md` 已记录当前维护机三进程模式：Web `3002`、Server `3001`、NeteaseCloudMusicApi `3310`。
  - runbook 已补充 health/provider 状态、`/api/next` 连续两次换歌、TTS fallback 和浏览器音量越界的冒烟观察点。
  - 等待人工验收与归档。
