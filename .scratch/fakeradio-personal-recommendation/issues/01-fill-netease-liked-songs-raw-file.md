# 填写网易云收藏原始歌单

Status: needs-triage
Type: HITL

## What to build

由用户把网易云收藏的原始歌曲列表写入 `user/netease-liked-songs.raw.json`。该文件作为后续个人收藏推荐改造的长期输入源，先保持原始结构，避免在没有真实数据前过早设计丢失字段。

## Acceptance criteria

- [ ] `user/netease-liked-songs.raw.json` 包含用户真实网易云收藏歌曲数据。
- [ ] 文件是合法 JSON，顶层结构保持为数组。
- [ ] 每首歌至少保留可长期定位歌曲的字段，例如网易云歌曲 ID、歌曲名、艺人、专辑；如果原始导出还有更多字段，先保留。
- [ ] 文件不包含登录 cookie、手机号、邮箱或其他账号密钥。

## Blocked by

None - can start immediately.

## Comments

原始文件已创建为空数组，等待用户写入。
