Status: completed（第三轮 Issue 26-33 于 2026-05-08 完成，commit `75a47e6`）

# FakeRadio 代码审查改进计划

## 审查历史

| 轮次 | 日期 | 测试数 | issue 数 |
|------|------|--------|----------|
| 第一轮 | 2026-05-04 | 205 | 13 (#01–#13) |
| 第二轮 | 2026-05-04 | 205 | 12 (#14–#25) |
| 第三轮 | 2026-07-01 | 275 | 8 (#26–#33) |

## 已解决的 issue

以下 issue 在第三轮审查时已确认修复：

| # | 标题 | 修复方式 |
|---|------|----------|
| 01 | 拆分 create-server.ts God Object | 拆分为 playback-state.ts、episode-runner.ts、register-routes.ts |
| 02 | 拆分 player-shell.tsx 巨型组件 | 提取 use-audio-engine、use-playback-state、use-stream-connection hooks |
| 03 | TTS cache manager 改用异步 I/O | 使用 fs/promises 的 access、writeFile、mkdir |
| 04 | WebSocket 消息处理增加异常保护 | use-stream-connection.ts 中 try/catch |
| 05 | 内存仓库增加大小限制 | maxEntries=100，append 时 shift |
| 06 | 修复脆弱的 defaultBaseDir 回退 | FAKERADIO_BASE_DIR 环境变量 + process.cwd() |
| 07 | 修复 TTS 状态判断逻辑 | 显式 ttsStatus 变量 |
| 08 | 增加优雅关停处理 | SIGTERM/SIGINT + 5 秒超时 |
| 09 | 时段切换时刷新播放队列 | /api/next 中检测 daypart 变化 |
| 10 | 统一 DjDecision 类型与 Schema | `type DjDecision = z.infer<typeof DjDecisionSchema>` |
| 11 | 统一 adapter 错误处理策略 | story source adapter 统一 try/catch + console.warn |
| 13 | 补充 scheduler 全时段覆盖 | 新增 00:00、12:00、14:00 时段 |
| 14 | Stream Bus broadcast 竞态 | 收集死 client 后统一删除 |
| 15 | Queue 数组永不修改 | removeFromQueue + 队列自动补充 |
| 16 | CORS 允许任意 localhost 端口 | 限定到显式端口列表 |
| 20 | Health webResearch 运算符优先级 | 提取为显式变量 |
| 21 | Mock TTS WAV 以 .mp3 扩展名服务 | 改为 .wav 扩展名 |
| 22 | /api/plan/today 未传 playlists | 传入 userPreferences.playlists |
| 23 | DeepSeek/MiMo 缺少请求超时 | 30s/15s AbortSignal.timeout |
| 24 | Web research 结果未缓存 | cached-web-research-adapter.ts |
| 25 | 统一时区契约 | utils/time.ts + Asia/Shanghai 默认时区 |

## 仍待解决的 issue

| # | 标题 | 类型 | 优先级 |
|---|------|------|--------|
| 12 | 为 buildContextWindow 补充单元测试 | test | 低 |
| 17 | 外部 HTTP 调用无重试逻辑 | bug | 中 |
| 18 | API 响应缺少 Zod 校验 | bug | 中 |
| 19 | 缺失响应压缩与连接超时 | performance | 低 |

## 新增 issue（第三轮审查）

| # | 标题 | 类型 | 优先级 |
|---|------|------|--------|
| 26 | 拆分 register-routes.ts 和 /api/chat intent 路由 | refactor | 高 |
| 27 | favorites 和 session 文件仓库并发读写竞态 | bug | 中 |
| 28 | /cache/tts/* 路由仍使用同步 existsSync | bug | 中 |
| 29 | DeepSeek adapter compute/computeRaw 代码重复 | refactor | 低 |
| 30 | export-pipeline 在请求中执行重型 FFmpeg 操作 | performance | 中 |
| 31 | cached-web-research-adapter 缓存无大小限制 | bug | 低 |
| 32 | DeepSeek adapter 硬编码 JSON schema 指令 | bug | 中 |
| 33 | /api/chat intent 分支手动构造 decision 未经校验 | bug | 低 |

## 第三轮审查结论

### 正面变化

- Issue #01 的 god object 拆分已落地，架构更清晰。
- 前端 hooks 提取质量高（use-audio-engine、use-playback-state、use-stream-connection）。
- 新增了真实的 LLM（DeepSeek）和 TTS（MiMo）adapter，不再是纯 mock。
- 新增了用户收藏、会话历史、品味推断、节目导出等功能，闭环更完整。
- 275 个测试全部通过，覆盖从 205 增长 34%。
- 时区统一（Asia/Shanghai）、TTS 异步 I/O、WebSocket 异常保护等基础设施改进到位。

### 当前主要风险

1. **register-routes.ts 成为新的 god object**（573 行，/api/chat ~200 行）— 最高优先级
2. **文件仓库并发竞态** — favorites 和 session 的 read-modify-write 无锁
3. **export-pipeline 阻塞请求** — FFmpeg 转码在 HTTP handler 中同步执行
4. **DeepSeek adapter JSON schema 硬编码** — 与 DjDecisionSchema 手动同步，易漂移

### Issue 依赖关系

```
#26 (拆分 register-routes)
  └── #33 (chat decision 构造) — 可在拆分时一并处理
#27 (文件仓库竞态) — 独立
#28 (existsSync) — 独立
#29 (DeepSeek 重复) — 独立
#30 (export 阻塞) — 独立
#31 (缓存大小) — 独立
#32 (JSON schema 硬编码) — 与 #29 可合并处理
```
