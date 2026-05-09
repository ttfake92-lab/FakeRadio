# A-12 导出流水线 — 混音 + show notes → 文件包

Status: needs-triage
Type: AFK

## Parent

- `.scratch/fakeradio-agent/PRD.md`

## What to build

用户在聊天框说「生成今天的节目」，服务端执行完整导出流程：

1. 从 session 和收藏列表找出今天有互动的歌（有收藏或有故事）
2. 为每首歌混音（A-10）：TTS + 压低配乐 + 完整歌曲
3. 将所有歌的混音按播放顺序拼接成一个完整音频文件
4. 生成 show notes Markdown 文档（A-11）
5. 打包为 ZIP 文件（包含音频 + show notes）
6. 返回下载链接

## Acceptance criteria

- [ ] Intent router 新增 `export-episode` intent（识别「生成今天的节目」「导出」「打包」等）
- [ ] `POST /api/export/today` 端点触发完整导出流程，返回 `{ downloadUrl: string, trackCount: number }`
- [ ] 导出流程：筛选有互动歌曲 → 逐首混音 → 拼接 → 生成 show notes → 打包 ZIP
- [ ] 最终 ZIP 包含：`show.mp3`（完整节目音频）+ `show-notes.md`（文字文档）
- [ ] ZIP 文件保存在本地 `exports/YYYY-MM-DD.zip`，通过 `/api/export/download/:date` 下载
- [ ] 前端有导出进度展示（几首歌中的第几首）
- [ ] 当天没有有互动的歌时，返回明确提示「今天还没有收藏或故事内容，先和电台互动一下吧」
- [ ] 测试：mock 数据驱动，验证文件输出结构和 ZIP 内容

## Blocked by

- A-10 音频混音引擎
- A-11 Show notes 生成器
