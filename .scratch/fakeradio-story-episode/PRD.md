# 真实资料驱动的 DJ 故事 Episode 播放闭环 PRD

## Problem Statement

FakeRadio 当前已经能播放真实网易云曲目，也能生成下一首和 DJ 文案，但体验仍接近“播放器加一句说明”。用户要的是本地音乐电台：点播放后，系统先准备一首适合当前用户、时段和环境的歌，再用真实资料讲一段简短音乐故事，口播快结束时音乐渐入，播放过程中后台准备下一首故事和音频，循环运行。

关键差距有四个：

1. 当前主 contract 是 `NowResponse` / `NextResponse`，没有“节目单元”概念，无法把歌曲、资料证据、故事文案、TTS 和播放阶段绑定成一个可预加载对象。
2. 当前 DJ 文案主要基于曲目信息和 mock LLM 语义，不能稳定讲“创作背景”；如果没有资料边界，大模型容易编造幕后故事。
3. 当前前端播放管线是用户驱动的单曲播放，没有“先 story、再 crossfade 进音乐、播放中预取下一集”的电台循环。
4. 当前可观测性只告诉用户 music provider 状态，没有告诉用户故事来自歌词、公开资料、网页研究，还是因为资料不足降级为情绪解读。

## Solution

引入 `RadioEpisode` 作为新的电台播放单元。一个 episode 至少包含：

- `track`：下一首要播放的真实或回退曲目。
- `story`：中文短故事文案、TTS 音频路径、故事类型和预计时长。
- `sources`：用于生成故事的证据片段，包括歌词摘要、公开元数据、网页研究摘要和来源 URL。
- `playback`：给前端执行 story-first 播放和 crossfade 的最小参数。

同时新增 `StorySourceAdapter` 边界。所有歌词、公开元数据和网页研究都只能通过这个边界进入 story composer，不能让 route 或前端直接拼 provider 逻辑。

故事生成遵循证据门槛：

- `background`：只有资料明确支持创作背景、发行背景、艺人访谈或专辑上下文时才允许使用。
- `lyric-theme`：有歌词但没有可靠创作背景时，讲歌词主题、情绪和意象。
- `mood-reading`：资料不足时，只讲听感、曲名、艺人和当前时段的关系，不冒充真实幕后。

## User Stories

1. 作为用户，我希望打开播放器后只点一次播放，FakeRadio 就能先讲一段关于下一首歌的音乐故事，再自然进入音乐。
2. 作为用户，我希望故事尽量来自真实资料，而不是大模型凭曲名编造。
3. 作为用户，我希望如果查不到创作背景，系统能坦诚降级成歌词主题或情绪解读。
4. 作为用户，我希望故事快结束时音乐慢慢叠进来，像真实电台串场，而不是口播和音乐割裂。
5. 作为用户，我希望歌曲播放过程中下一首故事已经在后台准备好，避免每首歌之间长时间等待。
6. 作为维护者，我希望歌词、百科、网页研究等资料源都通过 adapter 接入，后续可替换 provider。
7. 作为维护者，我希望每个 story 都带来源类型和证据摘要，方便排查它为什么这么讲。
8. 作为维护者，我希望 `RadioEpisode` contract 被 shared schema 固定，前后端不会各自猜字段。

## Implementation Decisions

- 新增 `RadioEpisode` contract，而不是把 story 字段继续塞进 `NextResponse`。
- 新增 `GET /api/episode/next`，用于生成下一集电台节目单元。
- 旧的 `GET /api/next` 先保留，作为普通下一首和回归验证路径。
- `StorySourceAdapter` 聚合多类资料源：本地网易云歌词、公开音乐元数据、网页研究。
- 第一版允许多级降级：`background` → `lyric-theme` → `mood-reading`。
- 没有明确来源时，story composer 不允许写“创作于”“背后的故事是”“这首歌是因为……”这类背景断言。
- 前端新增 story-first 播放状态机：`idle`、`preparing`、`story`、`crossfade`、`music`、`preparing-next`、`error`。
- 音乐渐入发生在 story 剩余约 2 到 3 秒时；如果浏览器无法获得 story 时长，先使用 TTS 预计时长或保守地在 story 结束后启动音乐。
- 当前阶段优先跑通本地闭环，UI 美化继续后置。

## Testing Decisions

- shared contract 测试覆盖 `RadioEpisode`、`StorySourceNote`、`StoryType`。
- server 测试覆盖：
  - episode route 成功返回 track、story、sources 和 TTS。
  - 没有背景资料时不能生成 `background` 类型故事。
  - 歌词可用时能生成 `lyric-theme` 类型故事。
  - TTS 失败时仍走 mock TTS fallback。
- adapter 测试覆盖 provider 可用、不可用、空结果和字段映射。
- 前端 view-model / controller 测试覆盖 story-first 状态转换、crossfade 触发和下一集预取条件。
- 端到端人工冒烟验证覆盖：点播放 → 准备 episode → 播 story → 音乐渐入 → 播放中准备下一集。

## Out of Scope

- 不在第一批做完整 UI 美化。
- 不在第一批做账号级网易云收藏、私人 FM 或个性化推荐。
- 不在第一批承诺所有歌曲都能查到真实创作背景。
- 不让大模型在无来源时编造事实性幕后故事。
- 不把网页研究 provider 写死在核心 route 中。
- 不在第一批实现多用户或云端同步。

## Further Notes

- 本 PRD 是 `.scratch/fakeradio-story-episode/issues/` 的父文档。
- 该功能依赖 FakeRadio 现有真实音乐来源、TTS fallback、音量 fade clamp 和本地 server/PWA 边界。
- 后续如果引入需要 API key 的资料源，应先更新 runbook 和 adapter 文档，再进入实现。
