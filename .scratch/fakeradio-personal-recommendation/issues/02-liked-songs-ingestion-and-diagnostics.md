# 读取原始歌单并暴露品味数据诊断

Status: needs-triage
Type: AFK

## What to build

让本地 server 读取 `user/netease-liked-songs.raw.json`，将其规范化为 FakeRadio 内部可消费的收藏歌曲视图，并通过本地 API 暴露数据诊断。这个切片不改变推荐策略，只让系统能确认收藏库是否被正确加载。

## Acceptance criteria

- [ ] server 启动或请求时能读取 `user/netease-liked-songs.raw.json`，文件缺失、空数组或解析失败时有明确降级结果。
- [ ] 新增或扩展本地 API，返回收藏库数量、有效歌曲数量、无效记录数量和少量样例字段。
- [ ] 数据诊断不返回敏感信息，也不暴露完整 3000 首列表给默认页面。
- [ ] 有 fixture 覆盖合法数组、空数组、字段缺失和非法 JSON。
- [ ] README 或 runbook 说明用户应把原始收藏写入哪个文件。

## Blocked by

None - can start immediately with fixtures. Final validation should use `01-fill-netease-liked-songs-raw-file.md` once real data is available.

## Comments

本切片的重点是建立可观测数据入口，不负责推荐质量优化。
