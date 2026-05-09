# FakeRadio 每日节目预热设计：全天计划型 Episode 池

## 背景

FakeRadio 当前的 story-first 播放链路在用户请求 `/api/episode/next` 时现场执行完整流程：

1. 选择下一首歌曲并解析可播放地址。
2. 收集歌词、公开元数据和网页研究资料。
3. 生成电台故事文案。
4. 调用 TTS 合成口播音频并写入 `cache/tts`。
5. 返回 `RadioEpisode`，前端先播放口播，再让音乐渐入。

这条链路能保证内容实时、个性化，但首次打开时等待时间较长。用户的主要使用方式是 server 常驻、电脑不关机，因此可以在夜间由 server 内部自动提前准备第二天的节目内容，让早上打开时直接播放本地已准备好的 episode。

## 目标

- 每天晚上自动按“明天”的全天计划预生成完整 `RadioEpisode`。
- 预生成内容必须包含歌曲、故事文案、故事音频 URL、资料来源和播放参数。
- 早上或白天播放时，`/api/episode/next` 优先消费当前时段的本地预生成 episode。
- 预生成池不足或失效时，自动回退到现有实时生成链路。
- 播放过程中用户要求换歌、临时插入别的歌曲、讲别的内容时，继续走实时插播链路，不破坏预生成池。
- 保持现有架构边界：PWA 只调用本地 server；外部服务仍通过 adapter；provider 逻辑不进入核心流程。

## 非目标

- 本阶段不做系统级 `launchd`、cron 或独立守护进程。server 常驻是前提。
- 本阶段不做云端同步和跨设备同步。
- 本阶段不保证整天每分钟都有线性节目单，只保证每个时段有可消费的 episode 池。
- 本阶段不重做前端播放器状态机。
- 本阶段不引入新的音乐、LLM 或 TTS provider。

## 推荐方案

采用“预生成 Episode 池”。

夜间任务按 `buildTodayPlan(明天)` 生成 daypart blocks，然后为每个时段准备若干个完整 `RadioEpisode`。这些 episode 保存到本地 SQLite；TTS 音频继续落在 `cache/tts`；歌曲音频可按需预下载到 `user/audio`。播放时，server 根据当前时段优先取一条未消费的 prepared episode。

这个方案介于“只预热底层缓存”和“严格全天计划单”之间：

- 比只预热缓存更快，因为播放时不用再拼装 episode。
- 比严格节目单更灵活，因为用户互动可以实时插播，插播不会让剩余预生成内容失效。
- 更符合现有 story-first contract，因为返回给前端的仍然是 `RadioEpisode`。

## 预热计划

### 触发时间

初始默认每天 `23:30` 触发一次 `daily-prewarm`。时间固定在 server 本地时区。

后续可以通过环境变量配置：

- `FAKERADIO_PREWARM_ENABLED`：是否启用，默认 `true`。
- `FAKERADIO_PREWARM_TIME`：每天触发时间，默认 `23:30`。
- `FAKERADIO_PREWARM_EPISODES_PER_BLOCK`：每个时段准备集数，默认 `3`。

### 预热范围

夜间任务准备“明天”的完整计划：

1. 用 `now + 1 day` 调用 `buildTodayPlan`。
2. 遍历明天的每个 block。
3. 每个 block 生成 `FAKERADIO_PREWARM_EPISODES_PER_BLOCK` 条 episode。
4. 初始计划通常有 6 个 block，因此默认生成 18 条 episode。

### 预热内容

每条 prepared episode 保存：

- `radioDate`：目标电台日期。
- `blockAt`：对应时段，例如 `07:00`、`09:00`。
- `status`：`ready`、`consumed`、`failed`。
- `episodeJson`：完整 `RadioEpisode` JSON。
- `trackId`、`title`、`artist`：便于诊断和去重。
- `storyType`：`background`、`lyric-theme` 或 `mood-reading`。
- `createdAt`、`consumedAt`、`error`。

`episodeJson` 必须通过 `RadioEpisodeSchema` 校验后再写入数据库。

## 数据模型

在 `StateRepository` 中新增 prepared episode 能力，并由 SQLite 持久化。

建议新增表：

```sql
CREATE TABLE IF NOT EXISTS prepared_episodes (
  id TEXT PRIMARY KEY,
  radio_date TEXT NOT NULL,
  block_at TEXT NOT NULL,
  status TEXT NOT NULL,
  episode_json TEXT,
  track_id TEXT,
  title TEXT,
  artist TEXT,
  story_type TEXT,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_prepared_episodes_lookup
ON prepared_episodes(radio_date, block_at, status, created_at);
```

`StateRepository` 新增方法：

- `savePreparedEpisode(input)`：保存一条 `ready` episode；`episode_json`、`track_id`、`title`、`artist` 和 `story_type` 必须非空。
- `claimPreparedEpisode(radioDate, blockAt)`：原子领取一条 `ready` episode，并标记为 `consumed`。
- `recordPreparedEpisodeFailure(input)`：记录某条预热失败；允许没有完整 episode，只要求 `radio_date`、`block_at` 和 `error`。
- `getPreparedEpisodeStats(radioDate)`：返回当天各 block 的 ready、consumed、failed 数量。
- `prunePreparedEpisodes(beforeRadioDate)`：清理旧数据。

`claimPreparedEpisode` 需要保证并发安全，避免两个请求拿到同一条 episode。`better-sqlite3` 可以用事务实现“查询 ready -> 更新 consumed -> 返回 episode”。

## 生成流程

新增 `server/src/prewarm/daily-episode-prewarmer.ts`，负责 orchestration，不直接实现 provider 逻辑。

核心流程：

1. 检查目标日期和目标 block 是否已经有足够的 prepared episodes。
2. 构建目标日期计划。
3. 为每个 block 按 mood hint 生成候选歌曲。
4. 复用现有 `resolveNextTrackAndDecision` 的选歌逻辑，或者抽出一个可传入 `currentMoodHint` / block context 的 runner。
5. 调用 `gatherEpisodeSources` 收集资料。
6. 调用 `narrateStoryWithSources` 生成故事。
7. 调用 `synthesizeWithFallback` 合成故事音频。
8. 组装并校验 `RadioEpisode`。
9. 保存到 `prepared_episodes`。

预热期间每条 episode 独立失败、独立记录。一个 block 失败不影响其他 block。

## 播放流程

`GET /api/episode/next` 调整为：

1. 计算当前 radio date 和当前 block。
2. 调用 `stateRepo.claimPreparedEpisode(radioDate, blockAt)`。
3. 如果拿到 ready episode：
   - 注册 `episode.track` 到 `trackRegistry`。
   - 记录 recently played。
   - 追加 DJ message。
   - 返回 `EpisodeNextResponseSchema.parse({ episode })`。
4. 如果没有 ready episode：
   - 走现有实时生成流程。

为了保持行为透明，可以给响应增加可选 diagnostics，但不强制前端立刻使用。若要扩展 shared contract，可增加：

```ts
preparation?: {
  source: "prepared" | "live";
  preparedEpisodeId?: string;
}
```

如果希望首版改动更克制，也可以先只在 server 日志和 `/api/prewarm/status` 暴露来源，不改 `EpisodeNextResponse`。

## 插播与互动

用户在播放中提出“放别的歌”“换一首”“讲这个歌的故事”“聊别的”等请求时，仍走现有 chat intent 和实时 episode 生成能力。

插播规则：

- 插播不消费 prepared episode。
- 插播成功后记录到 session 和 played history。
- 后续自动播放再次请求 `/api/episode/next` 时，继续从当前时段 prepared pool 领取。
- 如果插播导致当前时段氛围改变，本阶段不自动重写 prepared pool；下一轮夜间预热再吸收新的用户偏好。

## 歌曲音频预下载

预热任务可以顺手把歌曲音频保存到 `user/audio`，但播放入口仍保持 `/api/audio/:trackId`。

推荐分两步实现：

1. 第一版只预生成 episode 和 TTS，歌曲音频仍在播放时通过现有 `/api/audio/:trackId` proxy 录制。
2. 第二版增加 `recordTrackAudio(track)`，在夜间预热时下载歌曲音频到 `user/audio`，`/api/audio/:trackId` 优先读取本地文件。

这样可以先解决最大等待来源：LLM、资料收集和 TTS。歌曲下载的失败也不会阻塞 episode 就绪。

## 调度集成

现有 `createSchedulerLoop` 已支持 hourly tick 和 daypart change，但目前没有预热任务。可以扩展为：

- 每分钟 tick 时判断当前时间是否跨过 `FAKERADIO_PREWARM_TIME`。
- 用 `lastPrewarmRadioDate` 防止同一天重复触发。
- 触发后后台执行，不能阻塞 server 响应。
- server 关闭时停止 loop，但已完成的 prepared episode 保存在 SQLite。

建议新增轻量状态：

- `prewarm:last-run-date`
- `prewarm:last-started-at`
- `prewarm:last-finished-at`
- `prewarm:last-status`

这些可以先存在 `prefs_updates`，也可以跟 stats 一起从 prepared table 推导。

## 状态接口

新增：

```http
GET /api/prewarm/status
```

返回内容：

- enabled：是否启用。
- targetDate：当前准备目标日期。
- lastRun：最近一次任务状态。
- blocks：每个 block 的 ready、consumed、failed 数量。
- nextRunAt：下一次预计预热时间。

前端初版不必须展示该接口，但它用于调试和本地运行手册。

## 错误处理

- TTS 失败：沿用 `synthesizeWithFallback`，生成 mock TTS 音频，episode 仍可 ready。
- story source 失败：沿用 `gatherEpisodeSources` 的降级逻辑，最低生成 mock source。
- LLM 失败：记录 failed，不保存空 episode。
- music resolve 失败：跳过该候选，尝试下一条；耗尽后记录 failed。
- provider 限流：任务继续处理其他 block，并在 status 中暴露失败数量。
- prepared episode JSON 校验失败：记录 failed，不进入 ready 池。

## 测试策略

### 单元测试

- `StateRepository` prepared episode 保存、领取、统计、清理。
- `claimPreparedEpisode` 不重复领取同一条 episode。
- `dailyEpisodePrewarmer` 按 plan 为每个 block 生成目标数量。
- 单条失败不会中断整个预热任务。
- 已有足够 ready episode 时不会重复生成。

### 路由测试

- `/api/episode/next` 优先返回当前 block 的 prepared episode。
- 当前 block 无 ready episode 时回退实时生成。
- prepared episode 返回后会被标记 consumed。
- `/api/prewarm/status` 返回各 block 统计。

### 回归测试

- 原有 `/api/episode/next` story type、fallback、TTS 回退测试继续通过。
- 原有 `/api/next` 和 chat intent 不被 prepared pool 影响。
- `pnpm test`、`pnpm typecheck` 必须通过。

## 实施顺序

1. 扩展 shared contract，加入可选 prewarm status schema。
2. 扩展 `StateRepository`，新增 prepared episode 表和方法。
3. 抽出可复用的 episode 生成函数，避免 route 和 prewarmer 复制完整流程。
4. 新增 `daily-episode-prewarmer`。
5. 将 prewarmer 接入 server scheduler。
6. 修改 `/api/episode/next` 优先领取 prepared episode。
7. 新增 `/api/prewarm/status`。
8. 更新 `docs/local-runbook.md` 说明夜间预热配置和验证命令。

## 验收标准

- server 常驻时，每晚会自动为明天每个 daypart 准备默认 3 条 episode。
- 早上打开播放器，首次 `/api/episode/next` 不再等待资料收集、LLM 和 TTS 主链路。
- prepared pool 空时，播放仍可走现有实时生成链路。
- 用户聊天触发临时换歌或讲故事时，不消费 prepared pool。
- 失败可观测：能通过 `/api/prewarm/status` 看到 ready、consumed、failed。
- 所有新增文档为中文，并且不依赖对话上下文。
