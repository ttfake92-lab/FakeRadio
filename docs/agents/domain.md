# Domain Docs

本文档说明工程技能在探索 FakeRadio 代码库时，应该如何读取 domain docs。

## 布局约定

本仓库按 `single-context` 处理，也就是默认只有一个全局业务上下文。

技能在探索代码前，按下面顺序查找：

- 根目录 `CONTEXT.md`
- 根目录 `docs/adr/`

如果这些文件不存在，直接继续，不需要因为缺失而中断。

## 为什么是 single-context

- FakeRadio 目前虽然是 monorepo，但仍是一个产品、一个运行闭环
- `apps/web`、`server`、`packages/shared` 的边界是技术边界，不是独立业务上下文
- 当前没有 `CONTEXT-MAP.md`，也没有按子领域拆分的多套 glossary / ADR

## 对技能的约束

- 在 issue、计划、重构建议、测试命名里，优先使用仓库已经采用的业务词汇，例如 `PWA 播放器`、`本地 server`、`adapter`、`DJ brain`、`scheduler`
- 如果未来补充了 `CONTEXT.md`，应优先使用其中的 glossary 词汇，不擅自换同义词
- 如果未来补充了 `docs/adr/`，技能在提出架构调整前应先检查是否与既有 ADR 冲突

## 未来扩展

如果 FakeRadio 后续真的演化出多个业务上下文，例如：

- 独立的音乐 provider 编排子系统
- 独立的日程 / 环境感知子系统
- 独立的内容策划与 DJ persona 子系统

那时再引入 `CONTEXT-MAP.md` 和多上下文 `CONTEXT.md`，而不是现在提前拆分。
