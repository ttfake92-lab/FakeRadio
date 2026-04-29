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

## 结构

- `apps/web`：Next.js PWA 播放器。
- `server`：Fastify 本地服务中枢。
- `packages/shared`：前后端共享 contract。
- `user`：用户品味、日程、歌单和 mood rules。
- `prompts`：DJ persona 和 context window 说明。
- `docs`：架构、接口、adapter 和运行说明。
