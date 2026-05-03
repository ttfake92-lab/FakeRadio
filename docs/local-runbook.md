# FakeRadio 本地运行手册

## 安装

```bash
pnpm install
```

## 启动

```bash
pnpm dev
```

默认端口：

- Web: `http://localhost:3302`
- Server: `http://localhost:3301`

如果你希望 FakeRadio 优先使用真实网易云来源，还需要单独启动本地 `NeteaseCloudMusicApi` 服务。

根据 `NeteaseCloudMusicApi` README，默认端口是 `3000`，也支持通过 `PORT` 环境变量改端口。FakeRadio 默认约定把它启动在 `3300`，避免占用已有端口。

示例（Mac/Linux）：

```bash
PORT=3300 node app.js
```

如果你本地不是通过源码目录运行，而是用自己的启动方式，也请确保最终服务监听在：

```text
http://127.0.0.1:3300
```

如果 `3300` 已被占用，也可以改用别的端口，例如当前维护机实际使用的是：

```text
http://127.0.0.1:3310
```

这时只要同步设置 `FAKERADIO_NETEASE_API_BASE_URL` 即可。

FakeRadio 默认配置：

```bash
FAKERADIO_PROVIDER_MODE=auto
FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
FAKERADIO_NETEASE_TIMEOUT_MS=2500
```

当本地网易云服务不可用时，FakeRadio 会自动回退到 mock 音乐来源，不会阻塞本地页面和基本播放流程。

## 用户偏好文件

FakeRadio 启动时会读取 `user/` 目录下的偏好文件，用于 DJ 决策、调度上下文和选歌种子：

| 文件 | 用途 | 缺失时的行为 |
|---|---|---|
| `user/taste.md` | 用户品味，注入 DJ brain 的 `userTaste` 上下文 | 回退到默认品味描述 |
| `user/routines.md` | 日常节奏，注入 DJ brain 的 `routines` 上下文 | 回退到默认日程描述 |
| `user/mood-rules.md` | Mood 规则，注入 DJ brain 的 `moodRules` 上下文 | 回退到默认 mood 规则 |
| `user/playlists.json` | 歌单定义，用于生成 `buildTodayPlan` 的时段 block 和选歌 seeds | 回退到仅包含 `morning-soft-start` 的默认歌单 |

修改这些文件后重启 server 即可生效，无需改代码。

如果从 Codex 或一次性 shell 里启动，推荐用 `screen` 保持服务会话：

```bash
screen -dmS fakeradio-server zsh -lc 'cd /Users/tt/projects/FakeRadio && pnpm --filter @fakeradio/server dev'
screen -dmS fakeradio-web zsh -lc 'cd /Users/tt/projects/FakeRadio && pnpm --filter @fakeradio/web dev'
```

如果你也想把本地网易云服务一起放进 `screen`：

```bash
screen -dmS fakeradio-netease zsh -lc 'cd /path/to/NeteaseCloudMusicApi && PORT=3300 node app.js'
```

使用上面的 `screen` 调试命令时，Web 是 `http://127.0.0.1:3302`，Server 是 `http://127.0.0.1:3301`。

停止 `screen` 会话：

```bash
screen -S fakeradio-server -X quit
screen -S fakeradio-web -X quit
screen -S fakeradio-netease -X quit
```

## 环境变量

所有配置统一在项目根目录 `.env` 文件中（`server/.env` 已废弃）。

| 变量名 | 说明 | 默认值 | 必需 |
|---|---|---|---|
| `FAKERADIO_SERVER_PORT` | Server 端口 | `3301` | 否 |
| `FAKERADIO_PROVIDER_MODE` | 音乐来源：`auto` / `mock` / `netease` | `auto` | 否 |
| `FAKERADIO_NETEASE_API_BASE_URL` | 网易云 API 地址 | `http://127.0.0.1:3300` | 否 |
| `FAKERADIO_DEEPSEEK_API_KEY` | DeepSeek API key（LLM） | — | 否（无 key 时回退到 mock LLM） |
| `FAKERADIO_DEEPSEEK_MODEL` | DeepSeek 模型名 | `deepseek-v4-flash` | 否 |
| `FAKERADIO_DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com/v1` | 否 |
| `FAKERADIO_TTS_PROVIDER` | TTS provider：`edge` / `mimo` | `edge` | 否 |
| `FAKERADIO_MIMO_API_KEY` | MiMo TTS API key | — | 否（provider=mimo 时必需） |
| `FAKERADIO_MIMO_BASE_URL` | MiMo API 地址 | `https://api.xiaomimimo.com/v1` | 否 |
| `FAKERADIO_MIMO_TTS_VOICE` | MiMo 音色 | `茉莉` | 否 |
| `FAKERADIO_BRAVE_API_KEY` | Brave Search API key（网页研究） | — | 否（无 key 时优雅降级） |

`.env` 示例：

```bash
FAKERADIO_BRAVE_API_KEY=your_brave_key
FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
FAKERADIO_DEEPSEEK_API_KEY=your_deepseek_key
FAKERADIO_TTS_PROVIDER=mimo
FAKERADIO_MIMO_API_KEY=your_mimo_key
```

无 Brave API key 时，web-research-adapter 不报错，直接返回空数组。episode route 不受影响，走到现有降级链路（metadata → lyric → mood-reading）。

## 验证

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 常用接口

```bash
curl http://localhost:3301/api/health
curl http://localhost:3301/api/now
curl http://localhost:3301/api/next
```

检查当前 music adapter 是否走到真实网易云：

```bash
curl http://localhost:3301/api/health
```

如果返回的 `adapters.music` 是：

- `ready`：当前已接到本地网易云服务
- `mock`：当前正在使用回退路径

验证用户偏好加载与 taste 接口：

```bash
curl http://localhost:3301/api/taste | jq '{playlistsCount: (.playlists | length), firstPlaylist: .playlists[0].id}'
```

观察点：

- `playlists` 是否包含 `user/playlists.json` 中定义的全部歌单
- `taste` / `routines` / `moodRules` 是否反映 `user/` 目录下的真实文件内容

验证 04 / 05 相关行为：

```bash
curl http://localhost:3301/api/now
curl http://localhost:3301/api/next
curl http://localhost:3301/api/plan/today
```

观察点：

- `/api/now` 的 `track.source` 和 `queue[].source`
- `/api/next` 的 `decision.reason` 是否围绕真实曲目生成
- `/api/plan/today` 的 `blocks[].moodHint` 是否来自对应 playlist 的首个 seed
- 前端页面是否显示 `Music Provider` 和来源标签

验证网页研究（web research）功能：

```bash
# 检查 webResearch adapter 状态
curl http://localhost:3301/api/health | jq .adapters.webResearch

# 查看 episode 中的 source kind（有 API key 时才会查到网页资料）
curl http://localhost:3301/api/episode/next | jq '.episode.sources[] | select(.kind == "web")'
```

`adapters.webResearch`：
- `ready`：已配置 Brave Search API key，web 研究功能可用
- `disabled`：未配置 API key，功能关闭

当未配置 API key 时，episode route 正常降级，不影响播放流程。

## Episode 验证

```bash
# 查看 story source provider 状态（storySource + webResearch）
curl http://localhost:3301/api/health | jq '.adapters | {storySource, webResearch}'

# 获取完整 episode，查看 story type、sources 和 playback 参数
curl http://localhost:3301/api/episode/next | jq '{track: .episode.track.title, storyType: .episode.story.type, sourcesCount: (.episode.sources | length), fallbackReason: .episode.fallbackReason}'

# 验证 story audio 文件是否可访问
curl -s -o /dev/null -w "%{http_code}" http://localhost:3301$(curl -s http://localhost:3301/api/episode/next | jq -r '.episode.story.audioUrl')
```

观察点：

- `story.type` 是否有证据门槛：`background`（有 metadata/web 支撑）> `lyric-theme`（有歌词）> `mood-reading`（资料不足）
- `sources[].kind` 和 `sources[].confidence`
- story audio 文件是否返回 HTTP 200（mock TTS 回退生成的静音 WAV 也必须可播放）
- `fallbackReason` 是否记录了 TTS 或资料源回退原因
