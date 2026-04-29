# FakeRadio Adapter 指南

外部能力必须通过 adapter 接入。

## Adapter 类型

- LLM adapter：输入 context fragments，输出 `DjDecision`。
- Music adapter：搜索、推荐、解析音频 URL、获取歌词。
- TTS adapter：输入 DJ 口播文本，输出缓存音频路径。
- Weather adapter：输入当前环境，输出天气摘要和 mood hint。
- Calendar adapter：输出近期日程上下文。
- Device adapter：输出本地浏览器或 UPnP 设备。

mock adapter 是第一版默认实现。真实 provider 只能替换 adapter，不能绕过 shared contract。
