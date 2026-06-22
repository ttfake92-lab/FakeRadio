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

### 局域网访问（iPad / 手机）

Server 和 Web dev server 都监听 `0.0.0.0`，局域网设备可通过 `http://<本机IP>:3302` 访问。前端 `getServerBaseUrl()` 自动用当前页面 hostname + 3301，无需配置。CORS 允许任意来源。改前端后需升 `apps/web/public/sw.js` 的 `CACHE_NAME` 版本号，否则旧 JS 会被 Service Worker 缓存、新代码到不了设备。

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
FAKERADIO_NETEASE_COOKIE_FILE=user/secrets/netease-cookie.txt
FAKERADIO_NETEASE_AUDIO_LEVEL=exhigh
```

当本地网易云服务不可用时，FakeRadio 会自动回退到 mock 音乐来源，不会阻塞本地页面和基本播放流程。

### 网易云登录

FakeRadio 支持两种网易云登录方式：

#### 1. Cookie 直接注入（推荐）

由于 music.163.com 已封禁网页版二维码登录（返回 code 8821），当前推荐通过浏览器直接复制 cookie 注入：

1. 在浏览器打开 music.163.com 并登录
2. F12 → Application → Cookies → music.163.com → 复制 `MUSIC_U` 的值
3. 在 FakeRadio 前端「网易云登录」面板的「手动注入 Cookie」区域粘贴并提交

注入成功后立即生效，无需重启 server。cookie 默认保存到 `user/secrets/netease-cookie.txt`，该目录已加入 `.gitignore`，不要提交 cookie。

登录后，网易云 music adapter 会在请求中自动带上 cookie，并优先使用 `/song/url/v1` 请求 `FAKERADIO_NETEASE_AUDIO_LEVEL` 指定的音质。默认值是 `exhigh`，也可以改成 `lossless` 或 `hires`，但实际能否获取取决于账号权益、歌曲版权和网易云接口返回。

#### 2. 二维码登录（当前不可用）

播放器页原来的二维码登录流程因网易服务端封禁已无法完成：

- `POST /api/netease/login/qr`：生成二维码
- `GET /api/netease/login/qr/:key`：轮询扫码结果（最终会返回 8821）

如网易未来恢复该接口，可重新使用此方式。

## 用户偏好文件

FakeRadio 启动时会读取 `user/` 目录下的偏好文件，用于 DJ 决策、调度上下文和选歌种子：

| 文件 | 用途 | 缺失时的行为 |
|---|---|---|
| `user/taste.md` | 用户品味，注入 DJ brain 的 `userTaste` 上下文 | 回退到默认品味描述 |
| `user/routines.md` | 日常节奏，注入 DJ brain 的 `routines` 上下文 | 回退到默认日程描述 |
| `user/mood-rules.md` | Mood 规则，注入 DJ brain 的 `moodRules` 上下文 | 回退到默认 mood 规则 |
| `user/playlists.json` | 歌单定义，用于生成 `buildTodayPlan` 的时段 block 和选歌 seeds | 回退到仅包含 `morning-soft-start` 的默认歌单 |
| `user/netease-liked-songs.raw.json` | 网易云收藏歌曲原始数据，用于品味诊断和推荐候选 | 诊断 API 返回 `loaded: false`，不影响播放流程 |

**网易云收藏文件格式：** 将网易云「我喜欢的音乐」导出的 JSON 数组写入 `user/netease-liked-songs.raw.json`。每首歌需包含 `id`、`name`、`ar`（艺术家数组）、`al`（专辑对象，含 `name`）。示例：

```json
[
  {
    "id": 12345678,
    "name": "歌曲名",
    "ar": [{ "name": "艺术家名" }],
    "al": { "name": "专辑名", "picUrl": "https://example.com/cover.jpg" }
  }
]
```

写入后可通过 `curl http://localhost:3301/api/favorites/diagnostics` 查看加载状态。

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
| `FAKERADIO_NETEASE_TIMEOUT_MS` | 网易云 API 请求超时 | `2500` | 否 |
| `FAKERADIO_NETEASE_COOKIE_FILE` | 网易云登录 cookie 本地保存路径 | `user/secrets/netease-cookie.txt` | 否 |
| `FAKERADIO_NETEASE_AUDIO_LEVEL` | 网易云音质：`standard` / `higher` / `exhigh` / `lossless` / `hires` | `exhigh` | 否 |
| `FAKERADIO_DEEPSEEK_API_KEY` | DeepSeek API key（LLM） | — | 否（无 key 时回退到 mock LLM） |
| `FAKERADIO_DEEPSEEK_MODEL` | DeepSeek 模型名 | `deepseek-v4-flash` | 否 |
| `FAKERADIO_DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com/v1` | 否 |
| `FAKERADIO_TTS_PROVIDER` | TTS provider：`grok` / `mimo` | `grok` | 否 |
| `FAKERADIO_XAI_API_KEY` | xAI / Grok TTS API key（也兼容 `XAI_API_KEY`） | — | 否（provider=grok 时必需） |
| `FAKERADIO_XAI_TTS_BASE_URL` | xAI TTS API 地址 | `https://api.x.ai/v1` | 否 |
| `FAKERADIO_XAI_TTS_LANGUAGE` | Grok TTS 语言代码，如 `zh` / `en` / `auto` | `zh` | 否 |
| `FAKERADIO_MIMO_API_KEY` | MiMo TTS API key | — | 否（provider=mimo 时必需） |
| `FAKERADIO_MIMO_BASE_URL` | MiMo API 地址 | `https://api.xiaomimimo.com/v1` | 否 |
| `FAKERADIO_MIMO_TTS_VOICE` | MiMo 音色 | `茉莉` | 否 |
| `FAKERADIO_BRAVE_API_KEY` | Brave Search API key（网页研究） | — | 否（无 key 时优雅降级） |

`.env` 示例：

```bash
FAKERADIO_BRAVE_API_KEY=your_brave_key
FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
FAKERADIO_DEEPSEEK_API_KEY=your_deepseek_key
FAKERADIO_TTS_PROVIDER=grok
FAKERADIO_XAI_API_KEY=your_xai_key
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
- `/api/next` 的 `diagnostics` 字段：`candidateSource` 反映候选来源（curated/favorites/search/queue）、`signals` 和 `queries` 说明本次综合了哪些推荐信号，`rerankSource` 反映 LLM 是否从候选中选曲，`favoritesAvailable` 为收藏曲目数量
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

## 每日节目预热（Prewarm）

FakeRadio 支持在每天夜间自动生成次日完整节目，存储在本地 SQLite 中，播放时优先领取已准备好的 episode，减少实时生成延迟。

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|---|---|---|---|
| `FAKERADIO_PREWARM_ENABLED` | 是否启用夜间预热 | `false` | 否 |
| `FAKERADIO_PREWARM_TIME` | 每日预热触发时间（HH:mm） | `02:00` | 否 |
| `FAKERADIO_PREWARM_EPISODES_PER_BLOCK` | 每个时段 block 准备的 episode 数量 | `3` | 否 |

启用预热后，server 会在每天凌晨（默认 02:00）为明天的每个时段 block 生成指定数量的 episode，保存到 `prepared_episodes` 表。

### 验证预热是否工作

```bash
# 查看今日预热状态
curl http://localhost:3301/api/prewarm/status | jq '{enabled, targetDate, lastRun, nextRunAt, blocks: .blocks[] | {at, label, ready, consumed, failed}}'
```

返回示例（已启用且有 episode 准备就绪）：

```json
{
  "enabled": true,
  "targetDate": "2026-05-10",
  "lastRun": "2026-05-09T02:00:00.000Z",
  "nextRunAt": "2026-05-10T02:00:00.000Z",
  "blocks": [
    { "at": "00:00", "label": "午夜静谧", "ready": 3, "consumed": 0, "failed": 0 },
    { "at": "07:00", "label": "早晨轻启动", "ready": 3, "consumed": 0, "failed": 0 }
  ]
}
```

字段含义：
- `enabled`：是否启用（`FAKERADIO_PREWARM_ENABLED`）
- `targetDate`：预热目标日期（明天）
- `lastRun`：上次运行时间
- `nextRunAt`：下次计划运行时间
- `blocks[].ready`：该时段已准备就绪的 episode 数量
- `blocks[].consumed`：已被播放器领取的 episode 数量
- `blocks[].failed`：生成失败的 episode 数量

### 播放来源（Prepared vs Live）

`/api/episode/next` 优先领取 prepared episode，命中时返回的 `source` 字段为 `"prepared"`；没有 ready episode 时走实时生成，`source` 为 `"live"`。前端根据 `source` 在播放器状态区显示"已就绪"（prepared）或当前播放状态（live）。

### 本地歌曲音频预下载

夜间预热生成 episode 后，server 会自动尝试预下载对应歌曲音频到 `user/audio/` 目录（`user/audio/<trackId>.mp3`）。播放时 `/api/audio/:trackId` 优先读取本地文件，本地缺失时自动代理远端音频。

预下载状态记录在 `prepared_episodes.audio_downloaded` 字段，可通过 `/api/prewarm/status` 的各 block 统计间接观察。

### 常见失败处理

| 失败现象 | 可能原因 | 处理方式 |
|---|---|---|
| 所有 block ready = 0 | `FAKERADIO_PREWARM_ENABLED=false` 或预热未触发 | 检查环境变量，确认 server 重启后已加载 |
| 部分 block failed > 0 | 单个 episode 生成失败（选歌/TTS/资料失败） | 查看 server 日志 `[prewarm]`，对应 block 的选歌种子或 provider 状态 |
| 凌晨 02:00 未触发 | scheduler 未正确启动，或时间已过未到次日 | 重启 server，观察启动日志 `[prewarm] Starting prewarm` |
| prepared episode 被跳过 | 时段 block 时间已过，领取条件不满足 | 确认当前时间在目标 block 的时间范围内 |

### 全天计划准备页

独立页面（`/schedule`）展示每个时段 block 的 episode 准备状态、歌曲、文稿和 TTS 结果，供人工审计。不展示模型隐藏推理逐字稿，只展示系统记录和生成结果摘要。

## 故障排查

### Server 无法启动

1. 检查端口占用：`lsof -i :3301`
2. 检查 `.env` 格式是否正确（无引号，无多余空格）
3. 检查 `fakeradio.db` 是否可写

### 播放器显示"无法连接本地服务"

1. 确认 server 进程运行中
2. 确认 Web 和 Server 端口与 `NEXT_PUBLIC_FAKERADIO_SERVER_URL` 配置一致

### 音乐来源全部是 mock

1. 检查网易云服务是否启动：`curl http://localhost:3300`
2. 检查 cookie 是否有效：重新注入
3. 检查 `FAKERADIO_PROVIDER_MODE=auto`（非 `mock`）
