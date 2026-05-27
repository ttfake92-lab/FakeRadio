# 04 播放器展示真实来源、队列与诊断

Status: archived
Implemented: 2026-05-08
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

让播放器体验层可见地反映当前 provider 状态、当前曲目来源、当前队列和基础诊断信息，让用户能直接看出系统是在真实来源模式还是回退模式。

完成后，PWA 播放器不仅是一个“能播”的壳子，还会成为本地 AI 电台运行态的可解释界面。用户不需要读日志，也能看懂当前运行状态。

## Acceptance criteria

- [ ] 前端能展示当前 provider 状态或等价的可解释诊断信息
- [ ] 当前曲目与队列在真实 provider 路径下能正确呈现真实来源信息
- [ ] 当系统回退到 mock 时，前端能给出不扰人的可见提示，而不是静默表现得像一切都正常

## Blocked by

- `.scratch/fakeradio-v1/issues/02-real-music-source-and-fallback.md`
- `.scratch/fakeradio-v1/issues/03-dj-real-track-grounding.md`

## Comments

- 这条 slice 主要关心用户如何理解系统当前状态，而不是继续扩展 provider 能力本身。
- 2026-04-30 AI triage:
  - Category: enhancement
  - Why now: 真实音乐来源已经接通，前端需要显式呈现 provider 状态、来源和回退提示，避免把 fallback 伪装成正常运行。
- 2026-04-30 implementation update:
  - 已在播放器页面展示当前 music provider 状态、当前曲目来源、队列来源标签与 mock 回退提示。
  - `api-client` 新增 health 拉取；刷新操作会同步刷新 health、当前状态、队列和今日计划。
  - 对应验收项已满足，等待人工验收与归档。
