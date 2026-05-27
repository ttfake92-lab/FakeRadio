# A-04 歌曲背景故事生成 — 通过对话触发

Status: done (2026-05-27)
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

用户通过对话说「讲讲这首歌的背后故事」，Agent 发起 web research（复用已有 `webResearchAdapter`），生成一段有根据的背景故事并在聊天框展示。故事遵循 story episode 的证据门槛策略（有资料讲背景，无资料降级为情绪解读）。

生成的故事文本保存到当天的 session 记录（供 A-11 show notes 使用）。

## Acceptance criteria

- [ ] Intent router 新增 `story-background` intent（识别「讲故事」「背后」「创作」等关键词）
- [ ] `POST /api/chat` 处理 `story-background` intent：调用 web research → LLM 生成故事 → 回复 Agent 消息
- [ ] 故事遵循证据门槛：有 web research 结果才讲背景，否则降级 mood-reading
- [ ] 故事文本附带来源类型标注（`background` / `lyric-theme` / `mood-reading`）
- [ ] 生成的故事保存到当天 session 记录（与当前 trackId 关联）
- [ ] 响应时间：web research + LLM 生成总时长在前端有 loading 状态，不卡死界面
- [ ] 测试：mock web research 返回结果时生成 background 故事；无结果时生成 mood-reading

## Blocked by

- A-03 换歌时主动发故事钩子（共用 session 记录结构）
