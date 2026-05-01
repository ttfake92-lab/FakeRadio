# FakeRadio 网易云音乐 Adapter 设计

## 目标

在不改变前端 contract、也不破坏现有本地闭环的前提下，把 FakeRadio 的音乐来源从纯 mock 扩展为“优先使用真实网易云来源，失败时自动回退到 mock”。

第一批只覆盖音乐 adapter 边界内的三项能力：

- `search(query)`
- `recommend({ mood, limit })`
- `resolve(track)`

## 成功标准

- `MusicAdapter` 仍然是 FakeRadio 唯一的音乐能力入口。
- FakeRadio 通过独立的本地 `NeteaseCloudMusicApi` 服务获取真实音乐数据，而不是把 provider 逻辑直接写进路由或前端。
- 当本地 `NeteaseCloudMusicApi` 可用时，`/api/next` 和初始队列使用真实网易云来源，并返回 `source: "netease"` 的曲目。
- 当本地 `NeteaseCloudMusicApi` 不可用时，FakeRadio 自动回退到 mock，不中断现有页面和本地播放流程。
- `/api/health` 能暴露当前 `music` adapter 的实际状态。
- 第一版不引入登录态、歌词、歌单管理或账号相关逻辑。

## 范围

### 进入第一批

- 通过 HTTP 调用独立本地 `NeteaseCloudMusicApi`
- 搜索单曲
- 根据 `mood` 生成推荐候选
- 解析歌曲可播放 URL
- provider 探测和启动时回退
- 健康状态暴露

### 不进入第一批

- 歌词
- 私人 FM
- 账号登录态
- 歌单收藏、歌单管理
- 个性化推荐接口
- 运行时每次请求动态切换 provider

## 假设

- FakeRadio 仍使用 pnpm monorepo。
- FakeRadio server 仍运行在 `http://127.0.0.1:3001`。
- FakeRadio web 仍运行在 `http://127.0.0.1:3002`。
- 本地 `NeteaseCloudMusicApi` 默认基址改为 `http://127.0.0.1:3300`。
- provider 模式通过环境变量控制。
- 第一版优先保证“真实来源接入成功”与“失败时不断流”，而不是做最完整的网易云能力覆盖。

## 用户确认过的关键决策

### Provider 形态

采用独立的本地 `NeteaseCloudMusicApi` 服务。FakeRadio 的 music adapter 只通过 HTTP 与之通信。

### 不可用时行为

当本地网易云服务不可用时，FakeRadio 自动回退到 mock。

### 实现路径

采用“provider 工厂 + 健康探测器”方案，而不是把 provider 选择逻辑散落在 route 中。

## 方案对比

### 方案 A：最小侵入切换器

直接在 `create-server.ts` 里探测网易云服务，探测成功就实例化真实 adapter，失败就回退 mock。

优点：

- 改动少
- 很快能落地

缺点：

- provider 选择逻辑会粘在 server 启动流程里
- 后续再接别的 music provider 会越来越乱

### 方案 B：provider 工厂 + 健康探测器

新增 music provider 工厂，统一负责读取配置、探测本地网易云服务、返回真实 adapter 或 mock adapter，并把最终状态暴露给 server。

优点：

- 边界清晰
- provider 选择逻辑集中
- 便于后续扩展其他 music provider

缺点：

- 比直接写在 `create-server.ts` 多一个很小的抽象层

### 方案 C：双路并行 adapter

在运行时同时保留 mock 和 netease，每次请求动态判断走哪一条路径。

优点：

- 理论上更灵活

缺点：

- 复杂度高
- 运行时状态会抖动
- 不符合第一批“先稳定跑通闭环”的目标

## 采用方案

采用方案 B：provider 工厂 + 健康探测器。

## 架构设计

### 总体原则

- 前端 contract 不变。
- `MusicAdapter` 接口不被 provider 细节污染。
- 真实 provider 只能出现在 adapter 边界内。
- 启动时确定 music provider，本次 server 生命周期内不反复切换。

### 模块拆分

#### `server/src/adapters/music/netease-http-client.ts`

职责：

- 封装 `NeteaseCloudMusicApi` 的基础 HTTP 请求
- 统一处理 base URL、超时、请求失败和 JSON 解析
- 不承担业务映射和回退决策

#### `server/src/adapters/music/netease-http-music-adapter.ts`

职责：

- 实现 `MusicAdapter`
- 把 FakeRadio 的 `search`、`recommend`、`resolve` 调用翻译成对本地网易云服务的 HTTP 请求
- 把网易云返回字段映射成 FakeRadio `Track`

不负责：

- provider 探测
- mock 回退
- `/api/health` 状态维护

#### `server/src/adapters/music/create-music-adapter.ts`

职责：

- 读取环境变量
- 根据 provider 模式决定策略
- 探测本地网易云服务是否可用
- 可用时返回 netease adapter
- 不可用时回退 mock adapter
- 返回最终 `musicStatus` 供 server 使用

#### `server/src/config/env.ts`

职责：

- 声明 provider 模式和网易云服务配置
- 提供默认值和类型校验

#### `server/src/http/create-server.ts`

职责变化：

- 不再直接固定使用 `createMockMusicAdapter()`
- 启动时通过工厂拿到 `{ music, musicStatus }`
- 把 `musicStatus` 暴露到 `/api/health`
- 其他 route 保持通过 `MusicAdapter` 调用，不感知真实 provider 细节

## 接口映射

### `search(query)`

FakeRadio 调用：

```ts
music.search("warm morning indie")
```

映射策略：

- 请求本地网易云搜索单曲接口
- 只取歌曲结果
- 把结果映射到 `Track[]`

最少需要映射的字段：

- `id`
- `title`
- `artist`
- `album`
- `durationMs`
- `source: "netease"`

### `recommend({ mood, limit })`

第一版不直接依赖网易云个性化推荐接口，而是采用“mood 转 query，再搜索”的方式。

原因：

- 不依赖登录态
- 更稳定
- 更符合第一批只接通真实来源闭环的目标

执行方式：

1. 把 `mood` 当作搜索提示词
2. 调用网易云搜索
3. 截断到 `limit`
4. 返回 `Track[]`

### `resolve(track)`

执行方式：

- 用曲目 `id` 请求歌曲 URL 接口
- 把可播放地址填到 `audioUrl`
- 其他字段保留原有 `Track` 数据

如果接口返回无可用 URL，应视为 resolve 失败。

## 配置设计

### 环境变量

```env
FAKERADIO_PROVIDER_MODE=auto
FAKERADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3300
FAKERADIO_NETEASE_TIMEOUT_MS=2500
```

### 含义

- `FAKERADIO_PROVIDER_MODE`
  - `auto`：优先探测网易云，失败回退 mock
  - `mock`：强制 mock
  - `netease`：显式尝试网易云；若不可用，第一版仍回退 mock，但要留下清晰日志

- `FAKERADIO_NETEASE_API_BASE_URL`
  - 本地 `NeteaseCloudMusicApi` 服务地址
  - 默认使用 `http://127.0.0.1:3300`

- `FAKERADIO_NETEASE_TIMEOUT_MS`
  - 探测和 provider 请求超时
  - 防止 `/api/next` 因外部服务迟缓而卡住

## 回退策略

### 启动时决策

server 启动时执行一次 provider 探测：

1. 如果模式为 `mock`，直接使用 mock adapter
2. 如果模式为 `auto` 或 `netease`，先探测本地网易云服务
3. 探测成功，使用 netease adapter，`musicStatus = "ready"`
4. 探测失败，回退 mock adapter，`musicStatus = "mock"`

### 生命周期稳定性

第一版不做“每次请求重新探测并切换 provider”。

原因：

- 避免 `/api/health` 和实际播放来源频繁抖动
- 避免一会儿真实、一会儿 mock，导致行为难以推断
- 保持 server 生命周期内行为一致

### 空结果与错误区分

需要区分两类失败：

#### Provider 不可用

例如：

- 本地网易云服务未启动
- 超时
- 无法建立连接

处理方式：

- 仅在工厂探测阶段触发回退
- 整个 server 生命周期改用 mock

#### Provider 可用，但查询无结果

例如：

- `mood` 对应的 query 没搜到歌
- 指定 `query` 无匹配结果

处理方式：

- 不视为 provider 不可用
- adapter 返回明确错误
- 第一版 server 可以对 `/api/next` 增加一个本地兜底：当真实搜索无结果时，退回已有 mock 队列，保证电台不断流

## 对现有 route 的影响

### `GET /api/health`

现在需要真实反映 music adapter 状态：

- `ready`：当前使用网易云 adapter
- `mock`：当前回退到 mock

其他 adapter 状态暂不改动。

### `GET /api/next`

行为不改 contract，只改来源：

- 真实网易云可用时，`track.source` 应为 `"netease"`
- 网易云不可用时，仍返回可播放结果，但来源为 mock

### `GET /api/now`

不需要改 contract，只会随着当前曲目来源不同而体现出真实或 mock 的 `track`

## 测试策略

### 1. adapter 单元测试

目标：

- 验证 `search()` 能把网易云搜索结果映射成 `Track[]`
- 验证 `recommend()` 会使用 `mood` 作为 query，并截断到 `limit`
- 验证 `resolve()` 能返回带 `audioUrl` 的曲目

测试方式：

- 不依赖真实网络
- 用本地假 HTTP 响应或注入式 fetch stub 验证字段映射

### 2. provider 工厂单元测试

目标：

- 服务可用时返回 netease adapter，状态为 `ready`
- 服务不可用时回退 mock adapter，状态为 `mock`
- 模式为 `mock` 时不探测网易云

### 3. server 集成测试

目标：

- `/api/health` 正确返回 `music` 状态
- 网易云可用时 `/api/next` 返回 `source: "netease"`
- 网易云不可用时 `/api/next` 仍然成功返回 mock 曲目

## 文档更新

需要同步更新：

- `docs/adapters.md`
- `docs/local-runbook.md`
- `.env.example`
- 必要时更新 `docs/architecture.md` 中关于 mock-only 的表述

## 风险与约束

### 风险

- `NeteaseCloudMusicApi` 的返回结构可能和预期字段不同
- 某些歌曲可能拿不到稳定 `audioUrl`
- 搜索式 `recommend` 语义不如真正推荐接口丰富

### 当前处理方式

- 把 provider 返回映射集中在 adapter 内
- 对 `resolve` 失败和空搜索结果分别处理
- 把“推荐策略升级”留到后续，而不是和这次接入混在一起

## 非目标

以下内容明确不属于本次实现：

- 网易云账号登录
- 私人 FM
- 歌词展示
- 歌单收藏与管理
- 运行时热切换 provider
- 多 provider 排序或加权融合

## 实现后预期效果

实现完成后，FakeRadio 会具备这样的行为：

1. 启动时尝试连接本地 `http://127.0.0.1:3300` 的网易云服务
2. 如果服务可用，`/api/next` 和初始队列使用真实网易云曲目
3. 如果服务不可用，应用继续工作，并自动退回现有 mock 音乐来源
4. 前端无需感知 provider 细节，只通过既有 contract 获得曲目、队列和播放状态
