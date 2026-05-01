# Issue Tracker

本仓库当前使用本地 Markdown 作为 issue tracker，不依赖 GitHub Issues 或 GitLab Issues。

## 目录约定

- 一个功能或主题对应一个目录：`.scratch/<feature-slug>/`
- 需求文档使用：`.scratch/<feature-slug>/PRD.md`
- 实现 issue 使用：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- `NN` 从 `01` 开始递增，保证同一目录下可读、可排序
- triage 状态写在 issue 文件顶部附近的 `Status:` 行中
- 评论、澄清、补充上下文统一追加在文件末尾的 `## Comments` 段落

## 当技能要求“发布到 issue tracker”时

在 `.scratch/<feature-slug>/` 下创建对应 Markdown 文件；如果目录不存在，先创建目录。

## 当技能要求“读取 issue / ticket”时

直接读取对应 Markdown 文件内容。通常用户会提供路径、功能名，或 issue 编号。

## 当前选择的原因

- 仓库当前没有配置远端 `git remote`
- 更适合本地优先、单仓推进的开发节奏
- 后续如果迁移到 GitHub 或 GitLab，只需要更新本文件和 `AGENTS.md` 中的 `Agent skills` 摘要
