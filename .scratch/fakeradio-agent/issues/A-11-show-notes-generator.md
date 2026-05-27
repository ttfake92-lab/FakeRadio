# A-11 Show notes 生成器 — 有互动歌曲的文字文档

Status: done (2026-05-27)
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

基于当天 session 记录和收藏列表，生成一份 Markdown 格式的 show notes 文档。每首有互动的歌占一个章节，包含歌曲信息、DJ 故事文案、用户私人回忆（如有）和来源注释。

这是导出文件包（A-12）的文字组成部分。

## Acceptance criteria

- [ ] `server/src/export/show-notes-generator.ts` — 接受今日 session 数据，输出 Markdown 字符串
- [ ] 每首歌的章节结构：
  ```
  ## 《曲名》— 艺人
  
  **DJ 故事**
  [DJ 口播文案]
  
  **你的回忆**（如有）
  [用户私人回忆故事]
  
  来源：[background / lyric-theme / mood-reading]
  ```
- [ ] 文档开头有节目标题（「FakeRadio · YYYY-MM-DD」）和歌曲列表索引
- [ ] 没有故事内容的歌不出现在 show notes 中
- [ ] 输出为 UTF-8 Markdown 文件
- [ ] 测试：给定 mock session 数据，输出符合预期结构

## Blocked by

- A-07 对话会话持久化（数据来源）
