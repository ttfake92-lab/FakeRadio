# A-02 Agent 动作派发 — 通过对话触发「下一首」和「收藏」

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

扩展现有 intent router，让 Agent 能通过对话触发可执行动作（actions），而不只是返回文字回复。用户说「下一首」或「收藏这首」，Agent 解析意图后执行对应 action，并在聊天框确认结果。

Action 与 UI 按钮共用同一套底层逻辑，不绕过现有播放状态机。

## Acceptance criteria

- [ ] Intent router 新增 `add-favorite` intent
- [ ] `POST /api/chat` 响应支持返回 `action` 字段（`{ type: "next-track" | "add-favorite", ... }`）
- [ ] `shared` 包中 `ChatResponse` 新增可选 `action` 字段
- [ ] 前端收到 `action: "next-track"` 时自动触发下一首（与点按钮等效）
- [ ] 前端收到 `action: "add-favorite"` 时调用 `POST /api/favorites`，并在聊天框显示「已收藏《曲名》」
- [ ] Agent 对话上下文中包含当前正在播放的曲目信息（title、artist），使「这首」指代明确
- [ ] 测试覆盖：next-track intent 触发、add-favorite intent 触发、未匹配 intent 走普通 chat

## Blocked by

- A-01 本地收藏系统
