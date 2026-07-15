# FakeRadio · 小红书离线小工具 Demo

一个**完全离线、自包含**的静态电台播放器，用于上传到小红书「创作服务平台 → 小工具」，让读者在笔记里点开即可试听一期 FakeRadio 节目——DJ 口播 + 歌曲已混音好，逐首自动播放，回归老电台「不知道下一首是什么」的感觉。

> 本目录即上传产物包。`index.html` 在包根，整个目录零外部依赖、零网络请求。

## 本期节目 · 温柔摇滚

DJ 口播由 FakeRadio 的真实 LLM 管线生成、TTS 配音，与歌曲混音成逐段音频：

1. The Beatles — Here Comes the Sun
2. Queen — Love of My Life
3. Pink Floyd — Wish You Were Here
4. David Gilmour — On an Island
5. David Bowie — Life on Mars?

## 目录结构

```
xhs-radio-demo/
├── index.html          # 唯一入口(纯结构 + 内联 <style>)
├── app.js              # 全部交互逻辑(外置,事件全用 addEventListener)
├── episode-data.js     # 节目数据(window.__EPISODE__,代替被禁的 fetch json)
├── favicon.png         # 图标
├── README.md           # 本文件(可不进包)
└── assets/
    ├── audio/track-1.mp3 … track-5.mp3   # 每段=DJ口播+歌曲混音好的单段音频
    └── img/logo.jpg  dj.jpg              # FakeRadio 品牌头像 / DJ 头像
```

## 本地预览

```bash
cd xhs-radio-demo
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080 ,建议用手机尺寸(如 375×812)预览
```

也可直接双击 `index.html` 以 `file://` 打开（相对路径同样可用）。

## 功能

- 播放/暂停、上一首/下一首、进度条点击与拖动、音量 5 格（点当前格静音）
- DARK / LIGHT 主题切换（记忆在 localStorage）
- Hero 大时钟走真实本地时间
- 逐首自动连播；每切一首，曲名/艺人/DJ 故事文案随之更新
- EQ 频谱：默认纯 CSS 动画；若容器支持 WebAudio 则自动升级为真实频谱，不支持自动回退（不影响声音）

## 小红书沙箱合规

已逐条规避沙箱禁用项：

- **无任何网络请求**：不使用 fetch / XHR / WebSocket / SSE；节目数据以 `window.__EPISODE__` 全局对象注入（沙箱禁 fetch，无法读 `.json`，故数据放在 `episode-data.js`）
- **脚本全部外置**：HTML 里只有两行 `<script src>`，无内联逻辑；事件一律 `addEventListener`，无 `onclick=` 行内属性
- **音频只用包内文件**：`<audio src="./assets/audio/…mp3">`，不用 `data:` / `blob:`
- 不使用 eval / new Function / WebAssembly / Worker / Service Worker / iframe / 文件下载 / window.open / window.prompt
- 单一 `.html` 入口；只用白名单文件类型（.html/.js/.jpg/.png/.mp3）

自查（本地跑，应无实际命中，仅注释里出现这些词）：

```bash
grep -nE "fetch|XMLHttpRequest|WebSocket|EventSource|eval\(|new Function|onclick=|blob:|window\.open|\.prompt\(" index.html app.js episode-data.js
```

## 打包

用 `build-zip.mjs` 打包（它负责规范要求的细节：压缩目录「内容」让 `index.html` 落在 zip 根、排除非白名单文件、按曲目号挑子集并重新编号）：

```bash
# 全部 5 首
node xhs-radio-demo/build-zip.mjs --out build/fakeradio-minitool.zip

# 只要前 3 首（体积减半，用于绕开平台上传超时）
node xhs-radio-demo/build-zip.mjs --tracks 1,2,3 --out build/fakeradio-minitool-3songs.zip
```

脚本以本目录为母版、`episode-data.js` 为唯一数据真相，子集版的数据由它生成，不另存副本。

`README.md` 与 `build-zip.mjs` 不会进 zip：官方文件类型白名单只允许 `.html/.css/.js/图片/字体/.json`。

验证产物：解压后顶层应**直接看到 `index.html`**，而不是先看到一个文件夹。

上传：登录 PC 端小红书 →「创作服务平台 → 小工具」→ 新建小工具 → 上传 zip → 提交审核。审核通过后在移动端发笔记时一键挂载。

> ⚠️ **体积**：官方规范推荐总包 < 2MB，本包约 33MB（5 首完整歌曲）。若上传超限或加载过慢，可降码率（`ffmpeg -b:a 96k`）或改用歌曲片段。

## 换一期节目（更新内容）

播放器是**数据驱动**的，换节目只需替换两处，不用改 `index.html` / `app.js`：

1. 把新一期的分段音频（每段=口播+歌混音）放进 `assets/audio/`，命名 `track-1.mp3`、`track-2.mp3`…
2. 编辑 `episode-data.js` 的 `tracks` 数组：每首填 `title / artist / file / duration(秒) / story`。
   - `duration` 用 `ffprobe -v error -show_entries format=duration -of csv=p=0 track-N.mp3` 量取。
   - `story` 填该曲的 DJ 口播文案。

这些分段音频由 FakeRadio 的节目制作 + 导出管线产出（`server/src/export/export-show-project.ts`，产出落 `exports/<slug>/track-N.mp3` + `show-notes.md`）。

## 已知限制

- 移动端无鼠标，跟随光晕退化为静态背景光晕（无害）。
- WebAudio 若被容器禁用，EQ 回退为纯 CSS 动画（声音正常）。
- 数据存储（主题偏好）用 localStorage，沙箱内按小工具隔离，请勿假设永久持久化。

## 版权说明

包内音频含真实唱片（完整歌曲）与 AI 口播的混音。公开分发前请自行确认音乐版权授权情况。
