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
| `FAKERADIO_TTS_PROVIDER` | TTS provider：`grok` / `mimo` / `fish` | `grok` | 否 |
| `FAKERADIO_XAI_API_KEY` | xAI / Grok TTS API key（也兼容 `XAI_API_KEY`） | — | 否（provider=grok 时必需） |
| `FAKERADIO_XAI_TTS_BASE_URL` | xAI TTS API 地址 | `https://api.x.ai/v1` | 否 |
| `FAKERADIO_XAI_TTS_LANGUAGE` | Grok TTS 语言代码，如 `zh` / `en` / `auto` | `zh` | 否 |
| `FAKERADIO_MIMO_API_KEY` | MiMo TTS API key | — | 否（provider=mimo 时必需） |
| `FAKERADIO_MIMO_BASE_URL` | MiMo API 地址 | `https://api.xiaomimimo.com/v1` | 否 |
| `FAKERADIO_MIMO_TTS_VOICE` | MiMo 音色 | `茉莉` | 否 |
| `FAKERADIO_FISH_API_KEY` | Fish Audio API key | — | 否（provider=fish 时必需） |
| `FAKERADIO_FISH_BASE_URL` | Fish Audio API 地址 | `https://api.fish.audio` | 否 |
| `FAKERADIO_FISH_TTS_MODEL` | Fish Audio 模型（`model` header），如 `s2-pro` / `s1` / `s2.1-pro-free` | `s2-pro` | 否 |
| `FAKERADIO_FISH_TTS_TIMEOUT_MS` | Fish Audio 合成超时 | `60000` | 否 |
| `FAKERADIO_FISH_HTTPS_PROXY` | Fish Audio 专用代理，优先于系统级代理变量 | — | 否 |
| `FAKERADIO_BRAVE_API_KEY` | Brave Search API key（网页研究） | — | 否（无 key 时优雅降级） |
| `FAKERADIO_WEATHER_PROVIDER` | 天气来源：`auto` / `open-meteo` / `openweathermap` / `disabled` | `auto`（无 key 时用免 key 的 Open-Meteo） | 否 |
| `FAKERADIO_WEATHER_CITY` | 天气城市（支持中文名；运行时可被 `settings.weatherCity` 覆盖） | `Shanghai` | 否 |
| `FAKERADIO_OPENWEATHER_API_KEY` | OpenWeatherMap API key | — | 否（有 key 时 auto 模式优先用它） |
| `FAKERADIO_GROK_HTTPS_PROXY` | Grok TTS 专用代理（`https://...` URL）。优先于下面两个 | — | 否 |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | 系统级代理变量，Grok adapter 也会读。**境内用户**建议显式设 `HTTPS_PROXY=http://127.0.0.1:7897` | — | 否 |

> **Grok TTS 在境内需要走代理**。Node 的 `fetch` 不像 curl 会自动读 `HTTPS_PROXY`——Grok adapter 显式读这些环境变量并通过 `undici.ProxyAgent` 走代理。详见踩坑 #5/#6。

`.env` 示例（境内推荐配置）：

```bash
FAKERADIO_BRAVE_API_KEY=your_brave_key
FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
FAKERADIO_DEEPSEEK_API_KEY=your_deepseek_key
FAKERADIO_TTS_PROVIDER=grok
FAKERADIO_XAI_API_KEY=your_xai_key
HTTPS_PROXY=http://127.0.0.1:7897
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

> **当前策略（2026-06-22 起）**：**启动批量预热 + 低水位补生成**。`create-server` 启动时调 `runPrewarmForDate` 为当前 block 后台预生成 N 首完整 episode（含 resolve → compose → TTS），存入 `prepared_episodes`；`/api/episode/next` 和 `/api/episode/prefetch` 每消费一首 prepared 后，若剩余 ready 低于低水位，后台异步补生成到 N 首。
>
> **历史**：2026-06-22 早些版本曾取消批量预热、只预热第一首。原因是当时批量预热引发"已选曲目又重播"（prefetch 漏登记）。后来该 bug 已由优先槽（`priorityNextTrack`）+ prefetch 不清槽修复，消费链路干净，故重新启用批量预热。`prewarmFirstEpisode`（单首）已删除，由 `prewarmStartupEpisodes`（批量）取代。

### 工作机制

1. **启动预热**：`create-server.prewarmStartupEpisodes()` 对当前 block 调 `runPrewarmForDate`，生成 `FAKERADIO_PREWARM_STARTUP_EPISODES` 首完整 episode。后台 `void` 异步，不阻塞启动、不阻塞首次播放；第一首就绪后即可播，其余陆续准备（每首 5-15s LLM+TTS，10 首约 1-2 分钟）。
2. **低水位补生成**：`register-routes.ensurePreparedEpisodes()` 在 next/prefetch 消费 prepared 成功后触发；当前 block ready 数 < `FAKERADIO_PREWARM_LOW_WATER_MARK` 时后台补到 `FAKERADIO_PREWARM_STARTUP_EPISODES` 首。防重入（`prewarmRefilling` 标志），不阻塞响应。
3. **`appendRecommendedTracks` 异步化**：原来 `await appendRecommendedTracks(10)` 阻塞 next/prefetch 响应（9 次网易云搜索），现改为 `void ... .catch()` fire-and-forget。它只补 track 元数据进内存 queue，不生成口播——真正秒切靠 prepared_episodes。
4. **`/api/episode/next`、`/api/episode/prefetch` 选歌优先级**：优先槽（用户"插到下一首"）→ prepared episode（`source: "prepared"`）→ live 推荐（`source: "live"`）。
5. **TTS 失败即 failed，不降级入库**（2026-07-10 起）：预热路径禁用 macOS say 兜底（`audibleTtsFallback: false`），TTS 合成失败时该 episode 记 `failed`，等低水位补生成重试。此前设置切换的过渡窗口（provider 已切但 Voice ID 未填 → adapter disabled）会把系统 say 音频烘进 prepared episodes，用户播放命中即听到"系统音"。

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|---|---|---|---|
| `FAKERADIO_PREWARM_ENABLED` | 是否启用定时预热调度（日终品味推断 + tonight brief） | `true` | 否 |
| `FAKERADIO_PREWARM_TIME` | 定时触发时间（HH:mm，仅品味推断/节目调度，不再批量生成 episode） | `23:30` | 否 |
| `FAKERADIO_PREWARM_EPISODES_PER_BLOCK` | 老 `runPrewarmForDate` 内部每 block 上限（兼容保留） | `3` | 否 |
| `FAKERADIO_PREWARM_STARTUP_EPISODES` | **启动时为当前 block 预生成的完整 episode 数（秒切关键）** | `10` | 否 |
| `FAKERADIO_PREWARM_LOW_WATER_MARK` | **prepared 剩余 ready 低于此值时触发后台补生成** | `2` | 否 |

> **测试开关**：`RegisterRoutesDeps.prewarmRefillEnabled`（默认 `true`）控制运行时补生成；`createRadioServer({ skipStartupPrewarm: true })` 同时禁用启动预热和补生成，测试用避免后台写入污染断言。

### 验证预热是否工作

```bash
# 查看今日预热状态（启动后 ready 应逐渐增长到 STARTUP_EPISODES）
curl http://localhost:3301/api/prewarm/status | jq '{enabled, targetDate, lastRun, nextRunAt, blocks: .blocks[] | {at, label, ready, consumed, failed}}'
```

字段含义：
- `enabled`：是否启用定时预热调度
- `blocks[].ready`：该时段已准备就绪的 episode 数量（启动后会增长）
- `blocks[].consumed`：已被播放器领取的 episode 数量
- `blocks[].failed`：生成失败的 episode 数量

### 播放来源（Prepared vs Live）

`/api/episode/next` 优先领取 prepared episode，命中时返回的 `source` 字段为 `"prepared"`；没有 ready episode 时走实时生成，`source` 为 `"live"`。前端根据 `source` 在播放器状态区显示"已就绪"（prepared）或当前播放状态（live）。

prepared 池充足时，连续切歌应秒切不等口播；池空时（如刚启动预热未完成）走 live，单首 5-15s。

### 全天计划准备页

独立页面（`/schedule`）展示每个时段 block 的 episode 准备状态、歌曲、文稿和 TTS 结果，供人工审计。不展示模型隐藏推理逐字稿，只展示系统记录和生成结果摘要。

## 踩坑 / 已知问题

这一节是接手者最容易踩的坑，**先读这一节再调试**。

### 坑 1：网易云 `/simi/song` 端点返回的是**老版字段**

`/cloudsearch`、`/song/url/v1` 等"主流"端点用紧凑字段 `ar / al / dt`（artist 数组 / album 对象 / duration 毫秒）；`/simi/song`（相似歌曲）等老端点用 `artists / album / duration`。

`server/src/adapters/music/netease-http-music-adapter.ts` 的 `mapSongToTrack()` 已经同时支持两套字段，但**只对 `recommend()` 走 `/simi/song` 的路径生效**。症状：如果忘记兼容老字段，所有"相似歌"返回的 `artist` 全是 `Unknown Artist`，LLM 看到 `曲目: X - Unknown Artist` 就会顺着生成胡说的口播文案。

**怎么验证**：

```bash
# 直接看 simi 返回的字段
curl -s "http://127.0.0.1:3300/simi/song?id=2034742057" | python3 -c "import json,sys; s=json.load(sys.stdin)['songs'][0]; print(sorted(s.keys())[:10])"
# 应该看到 'artists' / 'album' / 'duration'，不是 'ar' / 'al' / 'dt'
```

**以后接新端点时**：永远先 wire 出去看实际 payload，不要假设字段名跟 `/cloudsearch` 一致。

### 坑 2：prepared episode 必须先 `music.resolve`

`/api/episode/next` 走两条路径：

- **live 路径**：`resolveNextTrackAndDecision` 内部会调 `music.resolve(track)` 拿到 `audioUrl`
- **prepared 路径**：`claimPreparedEpisode` 直接从 db 拿 `episode`，不会再 resolve

批量预热 `runPrewarmForDate` → `generatePrewarmEpisode` 内部已显式 `await music.resolve(track)` 之后再 `composeEpisodeFromTrack`。若以后改动 prewarmer，务必保留这步：否则存进 db 的 episode.track 没有 `audioUrl`，播放时 `/api/audio/:trackId` 404，提示"音乐加载失败"。

### 坑 3：prewarm 与 first-play 的 race condition

启动预热 `prewarmStartupEpisodes` 是 `void` 异步，不阻塞 server 启动。如果用户在预热未完成时点播放：

1. 第一次 `/api/episode/next` 走 live 路径，`recordPlayedTrack` + `rememberSelectedTrack` 把这首歌的 id 写进 `recently selected`
2. prewarm 完成后存好的 prepared 永远被 `claimPreparedEpisode` 的 `excludeTrackIds` 过滤掉
3. 用户再点下一首，prewarm 等于白做，路径上还得走 live（更慢）

生产环境用户从不会在启动 1-2 分钟内点播放，所以这不是用户痛点，是测试特例。

### 坑 4：Node `fetch` 错误的根因在 `error.cause`

`fetch failed` 是 undici 的通用包装外壳。真正原因（DNS / TLS / 代理 / 超时）藏在 `error.cause` 里。`synthesizeWithFallback` 现在的 catch 块**必须**打 `error.cause.name + error.cause.message`，否则永远不知道为什么 TTS 失败、为什么听到 macOS 系统声。

```typescript
} catch (error) {
  const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeMsg = cause instanceof Error ? `${cause.name}: ${cause.message}` : "(no cause)";
  console.error(`[tts] primary synthesis failed: ${error.message} | cause=${causeMsg}`);
}
```

**调试 TTS 故障时**：第一件事就是看 `cause=...` 那行。常见值：

- `ConnectTimeoutError` — TCP 连接超时（GFW 阻断或代理配错）
- `UND_ERR_SOCKET` — TLS 握手失败（代理协议不匹配）
- `ENOTFOUND` — DNS 解析失败
- `HTTPError 401/403/400` — API key 错或参数错（不是网络问题）

### 坑 5：undici 版本兼容

Node 22 的 `globalThis.fetch` 来自**内置** undici（更老的版本）。如果代码用了项目装的 `undici@7+` 的 `ProxyAgent` 当 dispatcher 给 `globalThis.fetch`，会抛 `InvalidArgumentError: invalid onRequestStart method`——这是 undici 在 5.x→6.x→7.x 之间的内部回调接口变动。

**修法**：`undici.ProxyAgent` **必须**配套 `undici.fetch`（同一实例）：

```typescript
import { ProxyAgent, fetch as undiciFetch } from "undici";
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
const fetchFn = dispatcher ? undiciFetch : fetch;  // 有代理才用 undici
const response = await fetchFn(url, { ..., ...(dispatcher ? { dispatcher } : {}) });
```

**测试单测**的 `vi.stubGlobal("fetch", ...)` 只在 `dispatcher` 为空时生效，因为非代理路径仍然走 `globalThis.fetch`。如果测试发现 `dispatcher` 非空导致 stub 不生效，需要在 `beforeEach` 显式 `delete process.env.HTTPS_PROXY` 等环境变量（vitest 继承 shell 的代理变量）。

### 坑 6：Grok TTS 默认在境内不可达

`api.x.ai` DNS 解析到 Meta CDN IP（`157.240.12.36` 等），被 GFW 阻断。Node 的 `fetch` 不像 curl 会自动读 `HTTPS_PROXY` 环境变量——必须显式传 `dispatcher`。

**境内用户**必须在 `.env` 显式配：

```bash
HTTPS_PROXY=http://127.0.0.1:7897
```

`tsx` 启动时不一定继承 shell 的代理环境变量，写到 `.env` 是最稳的。如果切到 Grok 后听到 macOS 系统声，先看 server 日志有没有 `[grok-tts] init: ... proxy=(direct)`——如果是 `(direct)` 说明没读到代理。

### 坑 7：TTS 缓存键

`grok-tts-adapter.ts:40` 的 `hashGrokPayload` 把 `voice/language/speed/style/text` 一起 hash 作为缓存键。**换音色后立刻生效**，但**同样文本 + 同样参数**永远命中缓存。TTS 调试时如果怀疑"没生效"，先确认文本不同 / 或 cacheKey 不同。

### 坑 8：TTS preview 路由不走 runtime manager

`server/src/http/routes/settings-routes.ts` 的 `/api/tts/preview` 临时构造 adapter（不走 `runtimeManager`），所以**它会读 `process.env` 找代理**，跟主路径一致。但**如果 preview 走 Grok 通而主路径不通**，说明 runtime manager 的 snapshot 没被刷新——重启 server 或显式 `applySettings` 即可。

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

### 主题节目"做 X 的节目"生成失败 / 歌曲全部不是主题艺术家

按以下顺序排查：

1. **看后端 console**：`[generate-now] preparation failed:` 或 `[generate-now] execution failed:` 带完整堆栈
2. **看前端右侧聊天栏 ProductionProgressPanel**：失败时显示带 `[preparation]` / `[execution]` 前缀的具体错误。如果显示 "UNIQUE constraint failed: show_projects.slug"，是同一天同主题重复 brief 撞 sqlite，已通过 slug 加毫秒时间戳修复（2026-06-24），重启 server 即可
3. **看 job 日志**：grep `[show-gen] block X using favorites fallback` —— 出现这条说明网易云 `/cloudsearch` 失效（cookie 过期），节目用 favorites 全集兜底凑齐，所以歌"不全是主题艺术家"。重新注入 cookie 后再编一期就正常
4. **netease cookie 报 `parse error: error:1C80006B`**：上游 NeteaseCloudMusicApi（3300 端口）AES 解密失败，cookie 过期或 NeteaseCloudMusicApi 进程缓存了旧 cookie。重新注入 cookie + 重启 NeteaseCloudMusicApi 进程

### 导出的节目音频口播和音乐叠在一起 / 音乐没有渐入

老版本（2026-06-23 之前）的项目导出用 `ffmpeg -f concat` 裸串接，没做混音。2026-06-24 已改为逐 episode 调 `mixEpisodeAudio`，**口播全程全音量 + 音乐在口播末尾 1 秒前 adelay + 3 秒 afade 渐入到全音量**。如果重启 server 后导出仍是叠在一起：

1. 确认 server 真的在跑新版代码（`git log -1 --format=%H` 应该是 2026-06-24 或之后的 commit）
2. ShowProject 的 `showAudioPath` 字段如果有值，会**直接拷贝旧文件**跳过混音 —— 删掉项目重新生成即可
3. 检查 ffmpeg 版本：`ffmpeg -version`，需要支持 `adelay` 和 `afade` filter（4.x 以上都支持）

### 主题节目导出"无法生成音频：所有 episode 的音乐文件都未能定位到本地"

后台 worker 生成的 episode 用户没在播放器里播过，第一次导出需要按需下载所有歌。失败原因通常是：

1. **网易云 cookie 失效** → 重新注入
2. **`audioDir` 写入权限问题** → 检查 `FAKERADIO_AUDIO_DIR` 路径权限
3. **歌曲版权地区限制** → 个别歌曲下载失败会跳过那个 segment，整期至少有 1 首成功就能导出
