# 12 限制 TTS cache 路由只能读取缓存目录

Status: ready-for-agent
Type: AFK

## Parent

- `.scratch/fakeradio-v1/PRD.md`

## What to build

`GET /cache/tts/*` 当前用 `filePath.startsWith(resolve(TTS_CACHE_DIR))` 判断文件是否在缓存目录内。当前缀相同的 sibling 目录存在时，绝对路径参数可以绕过检查，例如 `cache/tts2` 会被误判为在 `cache/tts` 内。

需要把路径校验改成严格的目录内判断，避免读取 TTS cache 目录外的本地文件。

## Acceptance criteria

- [ ] 绝对路径参数不能读取 `TTS_CACHE_DIR` 外的文件
- [ ] sibling 前缀目录不能绕过校验，例如 `cache/tts2` 不能通过 `cache/tts` 的检查
- [ ] 合法缓存文件仍可通过 `/cache/tts/<cacheKey>.mp3` 读取
- [ ] 新增 server 测试覆盖路径逃逸和合法缓存读取

## Blocked by

- None - can start immediately

## Verification

- 2026-05-01 最小复现：设置 `FAKERADIO_TTS_CACHE_DIR` 为临时 `cache/tts`，在 sibling `cache/tts2/secret.mp3` 写入内容后，请求 `/cache/tts/<absolute path to tts2/secret.mp3>` 当前返回 `200` 和文件内容。

## Comments

- 推荐实现：使用 `path.relative(baseDir, filePath)` 校验。只有 relative path 不以 `..` 开头、不是绝对路径、且文件存在时才返回音频。
