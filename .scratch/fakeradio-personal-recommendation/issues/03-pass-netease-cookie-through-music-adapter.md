# 修复网易云音乐请求登录态传递

Status: needs-triage
Type: AFK

## What to build

修复 `netease-http-music-adapter` 创建 HTTP client 时没有继续传入 `cookieProvider` 的问题，确保 music adapter 的搜索和音频 URL 解析请求可以真正带上已保存的网易云登录态。

## Acceptance criteria

- [ ] `createNeteaseHttpMusicAdapter` 使用默认 HTTP client 时会把 `cookieProvider` 传给 `createNeteaseHttpClient`。
- [ ] 单元测试覆盖 music adapter 传入 `cookieProvider` 后，请求 headers 包含 `cookie`。
- [ ] 现有自定义 `fetchJson` 注入测试不受影响。
- [ ] `/api/netease/login/status` 成功时，后续 music 请求与登录态链路一致。
- [ ] 文档中关于“登录后音乐请求会带 cookie”的描述与实现一致。

## Blocked by

None - can start immediately.

## Comments

诊断中已确认当前登录状态接口可用，但 music adapter 实际请求没有带 cookie。
