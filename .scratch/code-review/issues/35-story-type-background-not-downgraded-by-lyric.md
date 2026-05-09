# 35 有背景证据时不应因歌词来源降级为 lyric-theme

Status: ready-for-agent
Type: bug
Priority: P1

## Parent

- 代码审查：`server/src/http/episode-runner.ts`
- 相关 PRD：`.scratch/fakeradio-story-episode/PRD.md`

## What to build

`narrateStoryWithSources()` 当前先调用 `determineStoryType(sources)`，但随后只要 sources 中包含 `lyric`，就把 `background` 降级为 `lyric-theme`。

这违反 story episode 的证据优先级：

- 有 `metadata` 或 `web` 且 `confidence >= 0.5` 时，应允许 `background`
- 只有歌词支撑、没有可靠背景资料时，才降级为 `lyric-theme`
- 资料不足时才是 `mood-reading`

当前 `pnpm test` 已失败：`returns background story type when both lyric and metadata sources are present` 收到 `lyric-theme`，期望 `background`。

建议：

1. 移除“只要有 lyric 就降级”的逻辑。
2. 复用 `determineStoryType(sources)` 的结果作为最终 `storyType`。
3. 如果仍需要防止 LLM 编造背景，应通过 prompt 明确限制：只有 `storyType=background` 时才可讲事实背景；`lyric-theme` 只讲歌词主题；`mood-reading` 只讲听感和情绪。

## Acceptance criteria

- [ ] lyric + 高置信 metadata 返回 `background`
- [ ] lyric + 高置信 web 返回 `background`
- [ ] 只有 lyric 返回 `lyric-theme`
- [ ] 低置信 metadata/web 不触发 `background`
- [ ] `pnpm test` 中 story type 相关测试全部通过

## Blocked by

None - can start immediately

## Verification

```bash
pnpm test -- server/src/http/create-server.test.ts
pnpm test
```

## Comments

- 2026-05-09 code review: 当前失败断言为 `expected 'lyric-theme' to be 'background'`。
