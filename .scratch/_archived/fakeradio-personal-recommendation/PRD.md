Status: completed（Issue 02-06 于 2026-05-08 完成，commit `75a47e6`）

# FakeRadio 个人收藏推荐改造

## 背景

当前 FakeRadio 已经可以连接本地网易云服务，`/api/health` 也能显示 `music: ready`。但推荐链路仍主要依赖 LLM 生成短搜索词，再用网易云 `/cloudsearch` 搜索并选择前排结果。

这会把用户 3000 首收藏压缩成泛化 mood query，例如 `instrumental focus`、`deep focus electronic`，导致网易云返回功能音乐或关键词匹配歌曲，而不是贴近用户长期品味的歌曲。

## 目标

- 允许用户把网易云收藏歌单原始数据写入本地文件。
- 本地 server 能读取并诊断这份收藏库。
- 修复网易云 music adapter 的登录态传递问题。
- `/api/next` 的候选曲目优先来自收藏库或收藏库衍生的相邻品味，而不是只依赖 mood query。
- LLM 只在真实候选集里做 rerank 和解释，避免凭空生成不稳定搜索词。
- PWA 播放器能展示推荐链路诊断，方便判断“不准”发生在数据、候选、LLM rerank 还是 provider fallback。

## 非目标

- 不在本轮直接实现网易云账号级私人 FM。
- 不把 provider 专有逻辑写进 DJ brain。
- 不要求一次性完成复杂向量检索；可以先用规则化候选和可观测诊断打通闭环。
