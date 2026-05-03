# 15 Queue 数组永不修改（不只是时段切换问题）

Status: ready-for-agent
Type: bug

## Parent

- 代码审查：`FakeRadio/server/src/http/create-server.ts`

## What to build

`queue` 在 server 启动时生成一次，是 `const` 绑定：

```typescript
const queue = await music.recommend({ mood: currentMoodHint, limit: 3 }); // const
```

`selectCandidate()` 调用 `.find()` 查找可用曲目，**不修改数组**。每次 `/api/next` 都返回相同的 3 首曲目，其中已被 `recentlySelectedTrackIds` 排除的会降级返回 `tracks[0]`（可能重复）。

与 issue #09（时段切换时刷新）不同，本 issue 的核心是：**队列结构本身边界就没设计对**，即使 #09 修复了时段切换，`selectCandidate` 每次仍然返回数组里未被排除的第一首，不会真正从队列中移除已选曲目。

## How to fix

在 `resolveNextTrackAndDecision()` 成功选出一首曲目后，需要从队列中移除该曲目：

```typescript
// 在 track 选择成功后
const queueIndex = queue.findIndex(t => t.id === track.id);
if (queueIndex !== -1) {
  queue.splice(queueIndex, 1);
}

// 如果队列低于阈值，补充新曲目
if (queue.length < 2) {
  const replenished = await music.recommend({ mood: currentMoodHint, limit: 3 });
  queue.push(...replenished.filter(t => !queue.some(existing => existing.id === t.id)));
}
```

## Acceptance criteria

- [ ] 每次成功选择曲目后，从 `queue` 中移除该曲目
- [ ] 队列低于阈值时自动补充新曲目
- [ ] 不影响当前正在播放的曲目
- [ ] `buildNowResponse()` 反映真实的剩余队列
- [ ] 现有测试继续通过

## Blocked by

None — can start immediately

## Verification

连续调用 `/api/next` 多次（超过初始队列长度），验证队列内容递减后能自动补充，且不会出现连续重复曲目。

## Comments

- 本 issue 与 #09 正交：#09 解决"时段切换时应该换曲风"，本 issue 解决"队列本身是可变容器"。
