# A-01 本地收藏系统

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

建立本地收藏的完整数据层和 API，支持通过 HTTP 保存、查询、取消收藏当前正在播放的歌曲。收藏数据存储在本地 JSON 文件中（与 user preferences 同目录），前端可读取并展示收藏列表。

这是 Agent 动作派发（A-02）的前置，也是导出节目（A-12）判断「有互动的歌」的数据来源之一。

## Acceptance criteria

- [ ] `server/src/user/` 新增 `favorites-repository.ts`，支持 `save(track)`、`remove(trackId)`、`list()`、`has(trackId)` 操作
- [ ] 收藏数据持久化到本地 `favorites.json`（路径与 `user/` 偏好文件同目录）
- [ ] `POST /api/favorites` — 收藏当前播放曲目（body: `{ trackId, title, artist, ... }`）
- [ ] `DELETE /api/favorites/:trackId` — 取消收藏
- [ ] `GET /api/favorites` — 返回收藏列表
- [ ] `shared` 包新增 `FavoriteTrack` schema 和对应类型
- [ ] 前端播放器能查询 `/api/favorites` 并在播放曲目上展示收藏状态（已收藏/未收藏）
- [ ] 单元测试覆盖 repository 的 CRUD 操作

## Blocked by

None — can start immediately
