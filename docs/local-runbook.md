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

- Web: `http://localhost:3000`
- Server: `http://localhost:3001`

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

如果从 Codex 或一次性 shell 里启动，推荐用 `screen` 保持服务会话：

```bash
screen -dmS fakeradio-server zsh -lc 'cd /Users/tt/projects/FakeRadio && FAKERADIO_SERVER_PORT=3001 pnpm --filter @fakeradio/server dev'
screen -dmS fakeradio-web zsh -lc 'cd /Users/tt/projects/FakeRadio && pnpm --filter @fakeradio/shared build && NEXT_PUBLIC_FAKERADIO_SERVER_URL=http://127.0.0.1:3001 pnpm --filter @fakeradio/web exec next dev -p 3002'
```

如果你也想把本地网易云服务一起放进 `screen`：

```bash
screen -dmS fakeradio-netease zsh -lc 'cd /path/to/NeteaseCloudMusicApi && PORT=3300 node app.js'
```

使用上面的 `screen` 调试命令时，Web 是 `http://127.0.0.1:3002`。

如果你需要复现当前维护机的三进程模式：

```bash
screen -dmS fakeradio-netease zsh -lc 'cd /Users/tt/projects/NeteaseCloudMusicApi && PORT=3310 node app.js'
screen -dmS fakeradio-server zsh -lc 'cd /Users/tt/projects/FakeRadio/server && FAKERADIO_SERVER_PORT=3001 FAKERADIO_PROVIDER_MODE=auto FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3310 FAKERADIO_NETEASE_TIMEOUT_MS=2500 ./node_modules/.bin/tsx src/index.ts'
screen -dmS fakeradio-web zsh -lc 'cd /Users/tt/projects/FakeRadio && pnpm --filter @fakeradio/shared build && NEXT_PUBLIC_FAKERADIO_SERVER_URL=http://127.0.0.1:3001 pnpm --filter @fakeradio/web exec next dev -p 3002'
```

停止 `screen` 会话：

```bash
screen -S fakeradio-server -X quit
screen -S fakeradio-web -X quit
screen -S fakeradio-netease -X quit
```

## 环境变量

| 变量名 | 说明 | 必需 |
|---|---|---|
| `FAKERADIO_BRAVE_API_KEY` | Brave Search API key，用于网页研究支撑的创作背景资料（2000 queries/month 免费 tier） | 否（无 key 时优雅降级） |

如果使用 Brave Search 网页研究功能，需要申请 Brave Search API key（免费）并设置：

```bash
export FAKERADIO_BRAVE_API_KEY=your_brave_api_key_here
```

免费 tier 支持每月 2000 次查询，对 V1 阶段足够使用。

无 API key 时，web-research-adapter 不报错，直接返回空数组。episode route 不受影响，走到现有降级链路（metadata → lyric → mood-reading）。

## 验证

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 常用接口

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/now
curl http://localhost:3001/api/next
```

检查当前 music adapter 是否走到真实网易云：

```bash
curl http://localhost:3001/api/health
```

如果返回的 `adapters.music` 是：

- `ready`：当前已接到本地网易云服务
- `mock`：当前正在使用回退路径

验证 04 / 05 相关行为：

```bash
curl http://localhost:3001/api/now
curl http://localhost:3001/api/next
curl http://localhost:3001/api/plan/today
```

观察点：

- `/api/now` 的 `track.source` 和 `queue[].source`
- `/api/next` 的 `decision.reason` 是否围绕真实曲目生成
- `/api/plan/today` 的 `blocks[].moodHint`
- 前端页面是否显示 `Music Provider` 和来源标签

验证网页研究（web research）功能：

```bash
# 检查 webResearch adapter 状态
curl http://localhost:3001/api/health | jq .adapters.webResearch

# 查看 episode 中的 source kind（有 API key 时才会查到网页资料）
curl http://localhost:3001/api/episode/next | jq '.episode.sources[] | select(.kind == "web")'
```

`adapters.webResearch`：
- `ready`：已配置 Brave Search API key，web 研究功能可用
- `disabled`：未配置 API key，功能关闭

当未配置 API key 时，episode route 正常降级，不影响播放流程。
