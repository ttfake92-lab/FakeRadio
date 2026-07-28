# 品味闭环设计方案

> 2026-07-11 起草。覆盖三次讨论的结论：开头几首重复的根因修复、不喜欢按钮、品味画像自主整理。
> 状态：待用户确认后实施。

## 1. 问题与目标

**问题**：
1. 每次开播的头几首总是高频老面孔——根因是启动预热路径排重窗口只有 30 首（live 路径 200 首），叠加整条推荐管线零随机、全确定性。
2. 系统只有正反馈（收藏、对话），负反馈为零。讨厌的歌只能等它滚出排除窗口后再轮回；上次清 ambient 靠手动改文件。
3. "AI 懂你"的成分很薄：taste.md 写得再丰富，推荐引擎只用 8 条硬编码正则提取关键词（`extractTasteKeywords`）；随着使用时间变长，喜欢/不喜欢列表会无限膨胀，直接塞 prompt 不可持续。

**目标**：DJ 用得越久越懂用户。具体拆解为——
- 开播头几首不再重复（体验修复）
- 用户能一键表达"不喜欢"，系统立刻并长期规避（负反馈闭环）
- LLM 周期性把原始行为记录压缩成有界的结构化品味画像，自主维护、自主验证假设（记忆固化）

## 2. 总体架构：两层记忆 + 闭环

```
事实层（只增不改） → LLM 周期整理（日轻/周深） → 品味画像（结构化·有界） → 推荐引擎 + DJ
      ↑                                                                      |
      └────────── 播放反馈：收藏 · 不喜欢 · 跳过 · 定向探索的结果 ──────────────┘
```

**两层严格分离**：
- **事实层**：收藏、不喜欢、播放记录、对话。append-only，永不让 LLM 重写。track id 硬排除是 Set 查找（O(1)、不进 prompt），列表变长不构成负担。
- **画像层**：LLM 从事实层周期性提炼，固定 schema、大小有界。prompt 里只放它。37 首不喜欢的歌 → 压缩成一句"雷区：纯氛围电子、无人声长曲（不喜欢 ×N）"。

## 3. 阶段一：修复 + 负反馈进料（先做，数据越早积累越好）

### 3.1 预热排重窗口对齐（一行）

- [daily-episode-prewarmer.ts](../server/src/scheduler/daily-episode-prewarmer.ts) `runPrewarmForDate` 里 `getRecentlyPlayed(30)` → `getRecentlyPlayed(200)`，与 live 路径一致。

### 3.2 基础探索随机化（约 20 行）

个性化来源（收藏艺术家、taste 词）不动，只打破"永远取同样的前 N"：
- simi 种子：从收藏里**随机采样** 8 首，替代固定的文件顺序前 8 首（`buildRecommendationContext` 的 `seedTracks`）。
- top 艺术家 query：按频次**加权随机排序**，替代频次降序固定排列（`extractTopArtists` 输出后洗牌）。
- 说明：网易搜索加 offset / 提高 limit 暂不做（需改 adapter，收益待观察，见 §7）。

### 3.3 不喜欢按钮

**数据**（事实层新文件，与 favorites 对称）：
- `user/disliked-songs.json`：`[{ trackId, title, artist, dislikedAt }]`
- 新增 `server/src/user/disliked-songs-repository.ts`（参照 `favorites` 仓库实现：list / add / remove）

**API**：
- `GET /api/dislikes`、`POST /api/dislikes`、`DELETE /api/dislikes/:trackId`（挂在 register-routes，schema 进 `packages/shared` contracts）

**前端**：
- [editorial-radio.tsx](../apps/web/src/features/studio/editorial-radio.tsx) 收藏按钮旁加"不喜欢"按钮
- 点击行为：记录 + **立即切歌**（复用 skipToNext），并给一句 DJ 反馈文案
- `api-client.ts` 加 `addDislike` / `removeDislike`

**推荐引擎接入**（三层生效）：
1. **硬排除**：disliked trackId 全量并入 `excludedTrackIds`（永久，不受 200 窗口限制）
2. **艺术家降权**：同一艺术家累计 dislike ≥ 2 次才把它从 top 艺术家 query 榜剔除 / simi 种子排除。单次 dislike 只排除单曲——用户可能只是讨厌这一首，不 nuke 整个艺术家
3. **prompt 注入**：DJ brain 的 context 加"用户明确不喜欢"名单（近期 + 高频艺术家摘要，不是全量列表），选歌和口播都避开

**taste-inferer 输入升级**：日终推断的输入加"今日不喜欢"列表，让品味文件自动长出雷区，不再需要手动清理。

## 4. 阶段二：品味画像结构化 + 消费端升级

### 4.1 新文件：`user/taste-profile.json`（LLM 管理区）

与用户手写的 `taste.md` / `profile.md` 严格分离。schema（zod 校验）：

```jsonc
{
  "updatedAt": "2026-07-11T…",
  "coreStyles": ["classic rock", "indie folk"],          // 核心风格，供 query 生成
  "artistAffinity": {
    "loved": ["Queen", "…"],                              // 高置信喜欢
    "avoided": [{ "artist": "…", "evidence": 3, "since": "2026-07" }]
  },
  "avoidZones": [                                         // 雷区（风格级，带证据）
    { "pattern": "ambient / 纯氛围电子", "evidence": 3, "lastSeen": "2026-07-10" }
  ],
  "daypartPreferences": { "morning": "…", "night": "…" }, // 时段偏好
  "trends": ["最近两周收藏偏民谣"],                          // 近期趋势（短句）
  "hypotheses": [                                         // 待验证假设（阶段三消费）
    { "idea": "可能喜欢 dream pop", "confidence": "low",
      "status": "pending|confirmed|rejected", "evidence": ["收藏了 A、B"] }
  ]
}
```

大小有界：每个数组设上限（如 coreStyles ≤ 6、avoidZones ≤ 10、hypotheses ≤ 5），整理时由 LLM 淘汰旧条目。

### 4.2 消费端升级（替换 8 条正则）

- `extractTasteKeywords` 的 8 条硬编码正则 → 直接读 `taste-profile.json` 的 `coreStyles` 生成 queries（正则保留为 profile 缺失时的兜底）
- `avoidZones` / `artistAffinity.avoided` 进入推荐排除与降权
- DJ brain prompt 注入画像摘要（固定几百字，替代全量列表）

## 5. 阶段三：周期整理 + 假设-验证循环

### 5.1 整理任务（复用现有 23:30 prewarm tick）

- **日更（轻量）**：现有 `inferAndSaveTaste` 升级——输入加当日 dislike、播放/跳过统计；输出从"重写整个 taste.md"改为"更新 taste-profile.json 对应字段"（zod 校验失败则放弃本次更新，不写坏文件）
- **周更（深度）**：每周日全量重建画像：汇总 7 天事实层数据 + 上一版画像 → 生成新画像 + 核对假设（见下）+ 写 diff 日志

### 5.2 假设-验证循环（"越来越懂你"的实质）

1. 周更整理时 LLM 生成 ≤ 5 条假设（`hypotheses`）
2. 推荐引擎把探索名额（如 limit 的 1/5，即 20 里的 4 首）优先给假设对应的 query——探索从"随机"升级为"有目的的试探"
3. 下次周更核对结果：假设对应的歌被收藏/听完 → `confirmed`（升入 coreStyles）；被跳过/dislike → `rejected`（撤销）
4. 结果本身也是事实层数据，循环滚动

### 5.3 可见性（必做——陪伴感是本产品的最高体验准则）

- diff 日志写 `user/taste-profile.log.md`（append-only），用户随时可翻"DJ 这周对我的理解变了什么"
- DJ 周报口播："这周我发现你……"——把系统学习变成陪伴感内容

## 6. 护栏

1. **分区写权限**：LLM 只写 `taste-profile.json` 和它的 log；`taste.md`、`profile.md`、`playlists.json` 等用户手写文件一律不碰（防止 ambient 回写事故重演）
2. **证据计数 + 时间戳**：画像里每条负面结论必须带 `evidence` 计数和时间，整理时据此判断是否过时、是否达到降权阈值
3. **schema 校验前置**：LLM 输出不合法 → 放弃本次更新并记日志，绝不写入半坏的画像
4. **单曲 ≠ 风格**：dislike 按钮只收集"这首歌"；艺术家降权要 ≥ 2 次；风格级雷区只能由整理任务归纳产生，不做硬规则

## 7. 明确不做的事

- 不做 embedding / 音频特征相似度——网易只给艺术家和歌名，艺术家做"相似"代理已够
- 跳歌（30 秒内 skip）暂不当负信号——dislike 的显式信号质量高得多，先跑通再说
- 网易搜索 offset 随机暂不做——先看 §3.2 的效果
- 不引入向量库/外部记忆系统——两个 JSON 文件 + 定时任务足够

## 8. 实施顺序与验证

| 阶段 | 内容 | 主要文件 | 验证标准 |
|---|---|---|---|
| 一 | 窗口修复 + 随机化 + dislike | prewarmer / recommendation-engine / disliked-songs-repository（新）/ register-routes / editorial-radio / api-client | 单测：dislike 硬排除、艺术家 ≥2 降权、种子随机性；手测：点不喜欢立即切歌且该歌不再出现 |
| 二 | 画像 schema + 消费端 | taste-profile（新 schema + zod）/ recommendation-engine / dj-brain | 单测：profile 存在时 queries 来自 coreStyles、缺失时回退正则；avoidZones 生效 |
| 三 | 整理任务 + 假设循环 | taste-inferer 升级 / create-server prewarm tick / recommendation-engine 探索名额 | 单测：非法 LLM 输出不落盘、假设名额分配；手测：日终 tick 后画像更新且 log 追加 |

每阶段独立可交付、可回滚；阶段一先上线积累数据，阶段二三依赖它的事实层进料。
