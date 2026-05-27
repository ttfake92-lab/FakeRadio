# A-05 私人回忆故事 — 用户讲，Agent 编织成故事

Status: done (2026-05-27)
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

用户分享「这首歌让我想起……」的个人回忆，Agent 把用户的回忆输入结合歌曲信息，生成一段将个人经历与音乐连接的短故事文案，并在聊天框展示。

这是纯 LLM 生成任务，不需要 web research。生成的回忆故事保存到当天 session 记录，是导出节目 show notes 的核心内容。

## Acceptance criteria

- [ ] Intent router 新增 `personal-memory` intent（识别「让我想起」「回忆」「那时候」等关键词）
- [ ] Agent 提示词包含：用户的回忆输入 + 当前曲目 title/artist + 现有故事上下文
- [ ] 生成的文案将个人回忆与歌曲自然连接，语气个人化（第一人称叙述）
- [ ] 回忆故事保存到 session 记录，标注类型为 `personal-memory`
- [ ] 保存的内容包括：原始用户输入 + 生成的故事文案 + trackId + 时间戳
- [ ] 测试：给定用户回忆输入，LLM 调用收到正确 prompt 结构

## Blocked by

- A-04 歌曲背景故事生成（共用 session 记录结构）
