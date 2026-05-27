# FakeRadio Agent PRD

> **状态：11/12 已完成**（2026-05-27 更新）
> 唯一剩余：A-08 日终品味推断（推断逻辑已实现，缺 scheduler 自动触发）

## Problem Statement

FakeRadio 目前是一个被动的音乐播放系统：LLM 在后台生成 DJ 决策，但用户只能通过按钮操作（下一首、播放/暂停），无法通过自然语言控制电台行为，也没有办法把一天的听歌体验整理成可分享的内容。

核心差距有三个：

1. **对话控制缺失**：用户无法通过对话控制收藏、切歌、生成故事、修改品味。当前 intent router 只支持极简规则匹配，Agent 决策能力弱。
2. **陪伴感缺失**：换歌时 DJ TTS 口播已有，但聊天框是被动的——用户问才回，没有主动抛故事钩子的机制。
3. **内容沉淀缺失**：每天的听歌体验、DJ 故事、私人回忆都消失了，无法整理成一期可发布的音乐节目。

## Solution

把 FakeRadio 从「播放器 + 被动 DJ」升级为「对话驱动的本地电台 Agent」，并在一天结束时能导出一期完整的音乐节目。

### 三个核心能力

**1. Agent 对话控制层** ✅ 已完成
- 用户通过对话触发：下一首、收藏当前歌曲、生成歌曲故事、分享私人回忆
- 品味修改：主动说「不喜欢 X 风格」→ 即时更新 `taste.md`
- Agent 保留历史对话上下文，理解「这首歌」「刚才那首」等指代

**2. 主动陪伴** ✅ 已完成
- 换歌时，Agent 在聊天框主动发一条故事钩子（歌曲背景或情感入口）
- 用户可接着聊（分享回忆、追问背景），也可以忽略
- 故事类型：歌曲背景（走 web research）+ 私人回忆（用户讲，Agent 编织）

**3. 日终导出节目** ✅ 已完成
- 手动触发「生成今天的节目」
- 只含有互动（收藏/讲过故事）的歌
- 每首歌：[DJ 口播 TTS 配乐压低] → [音乐渐强] → [完整歌曲]
- 输出：一个完整音频文件 + 配套文字 show notes
- 导出为本地文件包，用户自行发布

## User Stories

1. ✅ 作为用户，我能跟 Agent 说「下一首」「收藏这首」，Agent 会执行对应动作。
2. ✅ 作为用户，每次换歌时聊天框会出现一条故事钩子，我可以选择接着聊。
3. ✅ 作为用户，我能说「讲讲这首歌的背后故事」，Agent 用 web research 生成有根据的背景故事。
4. ✅ 作为用户，我能分享「这首歌让我想起……」，Agent 把我的回忆编织成一段故事文案。
5. ✅ 作为用户，我能说「我最近不太喜欢钢琴曲」，Agent 立刻更新我的品味文件。
6. ✅ 作为用户，一天结束后我能触发「生成今天的节目」，得到一个完整音频 + show notes 文件包。
7. ✅ 作为用户，导出的音频有 DJ 口播配乐垫底 → 音乐渐强 → 完整歌曲的电台感。

## Issue 目录

所有 issue 位于 `.scratch/fakeradio-agent/issues/`，编号 A-01 至 A-12。

| Issue | 标题 | 状态 | 关键文件 |
|-------|------|------|----------|
| A-01 | 本地收藏系统 | ✅ done | `favorites-repository.ts`, `/api/favorites` |
| A-02 | Agent 动作派发 | ✅ done | `chat-intent-router.ts`（8 个 intent） |
| A-03 | 换歌时主动发故事钩子 | ✅ done | `register-routes.ts` proactive hook, SSE broadcast |
| A-04 | 歌曲背景故事生成 | ✅ done | 4 个 story-source adapters |
| A-05 | 私人回忆故事 | ✅ done | chat intent "让我想起\|回忆", `show-notes-generator.ts` |
| A-06 | 主动品味修改 | ✅ done | `/api/taste/infer`, `taste-inferer.ts` |
| A-07 | 对话会话持久化 | ✅ done | `session-repository.ts` |
| A-08 | 日终品味推断 | ⬜ open | 推断逻辑已有，缺 scheduler 自动触发 |
| A-09 | 服务端录制音频流 | ✅ done | `audio-recorder.ts` proxyAndRecord |
| A-10 | 音频混音引擎 | ✅ done | `audio-mixer.ts` FFmpeg duck/fade/concat |
| A-11 | Show notes 生成器 | ✅ done | `show-notes-generator.ts` |
| A-12 | 导出流水线 | ✅ done | `export-pipeline.ts`, `/api/export/*` |
