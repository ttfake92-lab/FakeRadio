# FakeRadio Context Window

每次触发 DJ 大脑时，按固定顺序组装六类片段：

1. System prompt：DJ 身份和输出规则。
2. 用户语料：taste、routines、playlists、mood rules。
3. 环境注入：now、weather、calendar、device availability。
4. 已检索记忆：recent messages、plays、plans、learned prefs。
5. 用户输入和工具结果：chat message、music search result、adapter result。
6. 执行轨迹：scheduler state、current queue、now playing、TTS cache status。
