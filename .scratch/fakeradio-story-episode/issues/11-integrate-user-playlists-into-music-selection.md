## Parent

- `.scratch/fakeradio-story-episode/PRD.md`

## What to build

接入 `user/playlists.json` 替换硬编码的选歌种子数组。

当前 `create-server.ts` 中内联了一个只包含 `morning-soft-start` 的硬编码 `PLAYLISTS` 数组，完全无视 `user/playlists.json` 中用户定义的 3 个歌单（早晨轻启动、写代码专注、晚间降速）。这导致选歌 seeds 无法反映用户真实偏好。

这个切片需要从 JSON 文件读取到 music adapter query 生成完整打通。

## Acceptance criteria

- [ ] 创建读取 `user/playlists.json` 的函数，解析失败时回退到当前硬编码
- [ ] `create-server.ts` 中硬编码的 `PLAYLISTS` 替换为文件内容
- [ ] `/api/episode/next` 选歌 seeds 来自用户定义的歌单
- [ ] 歌单结构变化时无需改代码，重启 server 即可生效
- [ ] 测试覆盖 JSON 解析和回退路径
- [ ] 手动验证：`/api/episode/next` 返回的 track 标签或 query 反映用户歌单偏好

## Blocked by

None - can start immediately
