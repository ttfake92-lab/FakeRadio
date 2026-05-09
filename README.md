# FakeRadio

FakeRadio 是一个本地优先、由大模型驱动的个人音乐电台。PWA 播放器只连接本地 Node.js server；server 负责用户语料、音乐选择、DJ 口播、TTS、环境输入、状态和调度。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认端口：

- Web: `http://localhost:3302`
- Server: `http://localhost:3301`

## 真实音乐来源

FakeRadio 当前支持两种音乐来源：

- mock music adapter
- 本地 `NeteaseCloudMusicApi` HTTP adapter

默认行为：

- `FAKERADIO_PROVIDER_MODE=auto`
- 优先探测本地网易云服务
- 探测失败时自动回退到 mock

运行时可以通过下面的接口确认当前来源：

```bash
curl http://127.0.0.1:3301/api/health
```

当返回 `adapters.music: "ready"` 时，表示当前已经走到真实网易云来源；返回 `"mock"` 时，表示当前处于回退路径。

> 注意：截至 2026-05，music.163.com 已封禁网页版二维码登录（返回 code 8821）。FakeRadio 前端已提供 Cookie 注入作为替代登录方式，详见 `docs/local-runbook.md`。

## 真实 LLM 与 TTS

FakeRadio 支持通过环境变量切换 LLM 和 TTS provider：

| 组件 | Provider | 环境变量 |
|------|----------|----------|
| LLM | DeepSeek（默认，需 API key） | `FAKERADIO_DEEPSEEK_API_KEY` |
| LLM | Mock（无 key 时自动回退） | — |
| TTS | MiMo V2.5 TTS | `FAKERADIO_TTS_PROVIDER=mimo` + `FAKERADIO_MIMO_API_KEY` |
| TTS | Edge TTS（默认） | `FAKERADIO_TTS_PROVIDER=edge` |

所有配置统一在项目根目录 `.env` 文件中。详见 `docs/adapters.md`。

## 当前已实现

- 前端展示当前曲目、队列、DJ 口播、今日计划和 provider 状态。
- `/api/next` 先生成选歌 query，再用真实 music adapter 搜索并回填 grounded DJ 文案。
- `/api/next` 会尽量避开当前正在播放的曲目；当真实搜索结果为空时会单次回退到 mock 曲目。
- TTS 合成失败时会回退到 mock TTS，不阻断“生成下一首”的主流程。
- 初始队列会按当前 daypart 的 `moodHint` 生成，不再固定使用单一 mood。
- server 会记录近期播放历史，后续 DJ 文案可引用上一首歌，形成连续感。
- 前端音量淡入淡出会限制在浏览器允许的 `[0, 1]` 区间内。
- **用户偏好接入**：server 启动时读取 `user/taste.md`、`user/routines.md`、`user/mood-rules.md` 和 `user/playlists.json`，注入 DJ 决策与选歌流程。
- **播放稳定性**：story audio 播放失败时不再自动回退到纯音乐，而是进入错误状态并提示用户。

## Story Episode（已实现）

FakeRadio 已实现 story-first 电台播放闭环：

- 用户点击播放后，FakeRadio 先基于真实资料生成音乐故事并口播（`background` > `lyric-theme` > `mood-reading` 三级证据门槛）
- 口播快结束时音乐自动渐入（crossfade），播放过程中后台预取下一集
- 故事资料来自网易云歌词、MusicBrainz 公开元数据和 Brave Search 网页研究
- 故事类型和资料来源在前端可见，非创作背景时有免责提示
- TTS 失败时自动回退到真实可播放的静音音频，不阻断电台循环
- 详细规划见 `.scratch/fakeradio-story-episode/PRD.md`

## 结构

- `apps/web`：Next.js PWA 播放器。
- `server`：Fastify 本地服务中枢。
- `packages/shared`：前后端共享 contract。
- `user`：用户品味、日程、歌单和 mood rules。
- `prompts`：DJ persona 和 context window 说明。
- `docs`：架构、接口、adapter 和运行说明。
