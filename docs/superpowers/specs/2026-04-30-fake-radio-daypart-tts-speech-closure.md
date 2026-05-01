# FakeRadio Daypart 时区修复与 TTS 口播闭环 PRD

## Problem Statement

FakeRadio 当前存在两个影响用户体验的问题：

1. **Daypart 时区错位**：`radio-scheduler` 使用 `getUTCHours()` 计算当前时间段，但计划块时间（如 "07:00"）是本地语义。当运行环境 UTC 偏移不为 0 时（例如中国 UTC+8），早上 8 点本地时间会被当成 UTC 0 点匹配，导致 "早晨轻启动"、"晚间降速" 等时段完全错位，电台在不合适的时刻播放不合适的音乐。

2. **TTS 口播没有音频闭环**：DJ 生成的口播文案虽然通过 WebSocket 推送到前端，但前端仅展示文本，没有实际播放音频。用户只能看到 DJ 说了什么，听不到。同时 TTS 仍使用 mock adapter，生成的是虚假音频地址，而非真实语音合成。

## Solution

1. **修复 daypart 时区**：将 `getCurrentPlanBlock` 中的 UTC 时间获取改为本地时间获取，使 "07:00" 匹配用户所在时区的早上 7 点。

2. **前端口播音频闭环**：在前端播放器中增加独立的口播音轨，通过双 audio 元素方案实现：音乐播放时收到 `dj-speech` 事件，音乐音量渐变降至 20%，口播音频开始播放，口播结束后音乐音量渐变恢复至 100%。

3. **Edge TTS 真实语音合成**：后端接入 `edge-tts` 库，将 DJ 文案合成为真实音频文件，按文案 hash 缓存到 `server/cache/tts/`，命中缓存时直接返回已有文件，避免重复合成。

## User Stories

1. 作为 FakeRadio 用户，我希望电台根据我所在的本地时间判断当前时段，以便在早上听到温暖启动的音乐、在晚上听到松弛降速的音乐。
2. 作为 FakeRadio 用户，我希望听到 DJ 的真实口播声音，而不只是看到文字，以便获得更自然的陪伴感。
3. 作为 FakeRadio 用户，我希望口播播放时音乐音量自动降低，口播结束后音乐恢复，以便像真实电台一样不突兀地接收 DJ 解说。
4. 作为 FakeRadio 开发者，我希望 TTS 音频能缓存复用，避免同一句话反复调用外部合成服务，以便降低延迟和外部依赖。
5. 作为 FakeRadio 用户，我希望口播音频和音乐能平滑过渡（淡入淡出），而不是突然切音量，以便体验更自然。
6. 作为 FakeRadio 开发者，我希望 daypart 修复后现有测试仍然通过，以便确认改动没有破坏既有行为。
7. 作为 FakeRadio 用户，我希望即使 Edge TTS 服务临时不可用，电台仍能正常工作（回退或报错明确），以便不中断播放体验。

## Implementation Decisions

### Daypart 时区修复

- **修改模块**：`radio-scheduler` 模块中的 `getCurrentPlanBlock` 函数。
- **变更点**：将 `now.getUTCHours()` 和 `now.getUTCMinutes()` 改为 `now.getHours()` 和 `now.getMinutes()`。
- **影响范围**：`buildTodayPlan` 生成的计划块时间标签保持不变（仍为本地语义字符串如 "07:00"），仅时间匹配逻辑从 UTC 切到本地。
- **测试策略**：更新 `radio-scheduler.test.ts` 中的测试用例，使用本地时间构造 Date 对象验证匹配结果。

### 前端口播播放器

- **模块拆分**：新增前端口播播放器逻辑，嵌入 `player-shell.tsx` 的播放器状态中。
- **技术方案**：双 `<audio>` 元素方案。现有 audio 元素继续负责音乐，新增第二个 audio 元素负责口播。
- **Ducking 参数**：
  - 音乐音量降至 20%
  - 渐变过渡时长 300ms
  - 使用 `requestAnimationFrame` 做音量线性插值
- **触发时机**：WebSocket 收到 `dj-speech` 事件且 `audioUrl` 存在时触发。
- **边界处理**：
  - 如果口播播放过程中收到新的 `dj-speech` 事件，应中断当前口播，重新开始新口播。
  - 如果音乐未在播放（idle/paused），口播仍应正常播放，无需 ducking。
  - 口播音频加载失败时，应静默失败并恢复音乐音量，不阻塞用户体验。

### Edge TTS Adapter

- **模块拆分**：新增 `edge-tts-music-adapter.ts` 或替换现有 `mock-tts-adapter.ts` 的工厂逻辑。
- **库选择**：使用 `edge-tts` npm 包（纯 Node、无需 key、中文支持好）。
- **语音选择**：默认使用中文女声（`zh-CN-XiaoxiaoNeural` 或类似），可通过环境变量覆盖。
- **输出格式**：MP3。
- **缓存策略**：
  - `cacheKey` 由文案文本的 SHA-256 短 hash 生成
  - 缓存文件存储于 `server/cache/tts/{cacheKey}.mp3`
  - 缓存目录不存在时自动创建
  - 命中缓存直接返回已有文件路径，跳过合成
- **接口**：保持现有 `TtsAdapter` 接口不变：`synthesize(text) -> TtsResult`
- **错误处理**：合成失败时抛出明确错误，由调用方决定如何展示（当前由 `/api/next` 捕获并转为 HTTP 500）。

### TTS 缓存管理器

- **职责**：封装文件系统操作，隔离路径生成和存在性检查。
- **接口**：
  - `resolvePath(cacheKey): string` — 返回缓存文件的绝对路径
  - `exists(cacheKey): boolean` — 检查缓存文件是否存在
  - `save(cacheKey, buffer): Promise<void>` — 保存音频 buffer 到缓存文件
- **深模块设计**：缓存管理器是一个 thin wrapper，但接口稳定，后续可替换为 Redis、S3 等而不影响上层。

### 配置扩展

- 新增环境变量（可选）：
  - `FAKERADIO_TTS_VOICE`：Edge TTS 语音名称，默认 `zh-CN-XiaoxiaoNeural`
  - `FAKERADIO_TTS_CACHE_DIR`：缓存目录，默认 `server/cache/tts`

## Testing Decisions

### 测试哲学

- 只测外部行为，不测实现细节。
- 前端 UI 交互（按钮点击、DOM 状态）不测，但音量渐变逻辑和播放状态机必须测。
- 后端文件系统操作使用临时目录隔离，不污染真实缓存目录。

### 模块测试覆盖

1. **radio-scheduler（修改后）**
   - 测试 `getCurrentPlanBlock` 对本地时间的正确匹配
   - 测试跨午夜、跨时段边界情况
   - 测试用例使用明确的本地时间 Date 构造

2. **前端口播播放器逻辑**
   - 测试音量插值函数：给定起始音量、目标音量、时长、已过去时间，返回正确音量值
   - 测试播放状态机：idle → playing speech → music restored 的转换
   - 不测试 React 组件渲染和 DOM 操作

3. **Edge TTS Adapter**
   - 测试缓存命中：给定已有缓存文件，直接返回，不调用 `edge-tts`
   - 测试缓存未命中：调用 `edge-tts` 生成，保存到缓存，返回结果
   - 测试合成失败：抛出错误，不残留不完整缓存文件

4. **TTS 缓存管理器**
   - 测试路径生成：给定 cacheKey 返回预期路径
   - 测试存在性检查：文件存在返回 true，不存在返回 false
   - 测试保存：写入后文件可读且内容正确

### 集成测试

- `create-server.test.ts` 中验证 `/api/next` 返回的 `tts.audioUrl` 指向真实可访问路径（使用临时缓存目录）。
- 前端通过 mock WebSocket 发送 `dj-speech` 事件，验证 audio 元素 src 被设置、音量变化逻辑触发。

## Out of Scope

- TTS 缓存自动清理策略（当前只累积，后续按需补充）。
- 多语言语音自动切换。
- 口播音频的实时流式播放（当前采用完整文件生成后播放）。
- 音乐 ducking 的高级音频处理（如使用 Web Audio API 的压缩器、均衡器），当前仅做简单音量渐变。
- TTS 服务降级策略（如 Edge TTS 失败时 fallback 到其他 provider），当前直接报错。

## Further Notes

- `edge-tts` 库通过逆向 Edge 浏览器的 Read Aloud 功能工作，无需 Azure 订阅或 API key，适合个人本地项目。
- 缓存目录应加入 `.gitignore`，避免音频文件进入版本控制。
- 前端口播播放的实现应尽量不破坏现有 `<audio controls>` 的用户交互习惯，音乐 audio 元素保持可见控件，口播 audio 元素可隐藏。
- daypart 修复后，如果用户跨时区旅行（电脑时区改变），电台会自动适配新时区，无需额外配置。
