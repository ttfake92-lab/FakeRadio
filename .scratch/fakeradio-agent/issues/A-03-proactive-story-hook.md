# A-03 换歌时 Agent 主动在聊天框发故事钩子

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

每次换到新歌时，服务端通过 WebSocket stream 向前端推送一条 Agent 消息，内容是这首歌的简短故事钩子（1-2 句，情绪入口或背景片段）。前端在聊天框以「DJ 消息」样式展示，用户可以回复，也可以忽略。

钩子内容由 LLM 生成，使用已有的歌曲 story 信息（来自 episode 的 `story.text` 或 context-builder）。不做新的 web research，避免换歌延迟。

## Acceptance criteria

- [ ] `StreamEvent` 新增 `agent-message` 类型，携带 `{ role: "agent", text: string, trackId: string }`
- [ ] 服务端在 episode 或 next 决策完成后，通过 stream bus 广播 `agent-message`
- [ ] 钩子文本复用已生成的 story text，不重复调用 LLM
- [ ] 前端聊天框以「DJ」气泡样式展示 agent-message，与用户消息视觉区分
- [ ] 钩子消息不阻塞换歌流程（异步推送）
- [ ] 测试：stream 事件格式正确，前端正确渲染 agent-message

## Blocked by

None — can start immediately
