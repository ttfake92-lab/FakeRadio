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

如果从 Codex 或一次性 shell 里启动，推荐用 `screen` 保持服务会话：

```bash
screen -dmS fakeradio-server zsh -lc 'cd /Users/tt/projects/FakeRadio && FAKERADIO_SERVER_PORT=3001 pnpm --filter @fakeradio/server dev'
screen -dmS fakeradio-web zsh -lc 'cd /Users/tt/projects/FakeRadio && pnpm --filter @fakeradio/shared build && NEXT_PUBLIC_FAKERADIO_SERVER_URL=http://127.0.0.1:3001 pnpm --filter @fakeradio/web exec next dev -p 3002'
```

使用上面的 `screen` 调试命令时，Web 是 `http://127.0.0.1:3002`。

停止 `screen` 会话：

```bash
screen -S fakeradio-server -X quit
screen -S fakeradio-web -X quit
```

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
