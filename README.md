# FakeRadio

FakeRadio 是一个本地优先、由大模型驱动的个人音乐电台。PWA 播放器只连接本地 Node.js server；server 负责用户语料、音乐选择、DJ 口播、TTS、环境输入、状态和调度。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认端口：

- Web: `http://localhost:3000`
- Server: `http://localhost:3001`

如果你需要把服务放进持久会话，当前常用做法是：

- Web: `http://127.0.0.1:3002`
- Server: `http://127.0.0.1:3001`

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
curl http://127.0.0.1:3001/api/health
```

当返回 `adapters.music: "ready"` 时，表示当前已经走到真实网易云来源；返回 `"mock"` 时，表示当前处于回退路径。

## 当前已实现

- 前端展示当前曲目、队列、DJ 口播、今日计划和 provider 状态。
- `/api/next` 先生成选歌 query，再用真实 music adapter 搜索并回填 grounded DJ 文案。
- 初始队列会按当前 daypart 的 `moodHint` 生成，不再固定使用单一 mood。
- server 会记录近期播放历史，后续 DJ 文案可引用上一首歌，形成连续感。

## 结构

- `apps/web`：Next.js PWA 播放器。
- `server`：Fastify 本地服务中枢。
- `packages/shared`：前后端共享 contract。
- `user`：用户品味、日程、歌单和 mood rules。
- `prompts`：DJ persona 和 context window 说明。
- `docs`：架构、接口、adapter 和运行说明。
