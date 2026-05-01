# Triage Labels

这些工程技能内部使用五个 canonical triage 角色。本文件把它们映射到本仓库实际使用的状态字符串。

| 技能内部角色 | 本仓库状态字符串 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 需要维护者先评估问题或需求 |
| `needs-info` | `needs-info` | 还缺关键信息，等待补充 |
| `ready-for-agent` | `ready-for-agent` | 规格清晰，可以让 agent 独立推进 |
| `ready-for-human` | `ready-for-human` | 需要人类开发者亲自处理 |
| `wontfix` | `wontfix` | 明确不打算执行 |

## 本仓库中的使用方式

由于当前 issue tracker 是本地 Markdown，这些状态通常写在 issue 文件顶部：

```md
Status: ready-for-agent
```

## 维护原则

- 默认直接使用上表中的字符串，不做别名映射
- 如果未来切换到 GitHub / GitLab labels，优先复用这些词，减少技能配置变更
- 如果必须改名，只更新右侧“本仓库状态字符串”这一列，并同步更新已有 issue 模板
