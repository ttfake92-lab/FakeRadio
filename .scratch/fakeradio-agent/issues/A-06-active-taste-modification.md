# A-06 主动品味修改 — 对话即时更新 taste.md

Status: done (2026-05-27)
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

用户在对话中明确表达品味偏好变化（如「我最近不太喜欢钢琴曲了」「这种节奏太快，以后少推」），Agent 识别意图后立即用 LLM 将新偏好合并进 `taste.md`，并在聊天框确认已更新。

品味文件在下一次 DJ 决策时自动生效（context-builder 已从文件读取）。

## Acceptance criteria

- [ ] Intent router 新增 `update-taste` intent（识别「不喜欢」「以后少推」「更喜欢」等明确表达）
- [ ] Agent 读取现有 `taste.md` 内容，用 LLM 将用户表达合并写入（追加或替换相关段落）
- [ ] 更新后在聊天框显示「已更新你的品味：[具体变更内容]」
- [ ] 更新为原子操作：LLM 生成新内容后再写文件，失败不破坏原文件
- [ ] 下一次 `/api/next` 或 `/api/episode/next` 调用时自动使用更新后的 taste
- [ ] 测试：用户输入品味修改意图 → `taste.md` 内容被正确更新

## Blocked by

None — can start immediately
