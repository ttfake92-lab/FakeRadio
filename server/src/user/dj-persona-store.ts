import type { DjPersonaOverride } from "@fakeradio/shared";

// DJ 人设覆盖的进程内单例。
//
// systemPrompt(prompts/dj-persona.md)在 create-server 启动时读一次、以字符串形式
// 穿透几十个调用点;让每个调用点改成动态读取的改动面太大。这里改用单例:
// - create-server 启动时从 stateRepo pref 恢复覆盖项
// - PUT /api/persona 更新单例 + 持久化
// - buildContextWindow(所有 DJ LLM 调用的唯一汇聚点)组装 system fragment 时追加覆盖段
// 这样人设编辑立即对聊天、口播、预热生效,不用重启。

export const DJ_PERSONA_PREF_KEY = "dj:persona";

let override: DjPersonaOverride | null = null;

function hasContent(value: DjPersonaOverride | null): value is DjPersonaOverride {
  return !!value && [value.name, value.personaText, value.replyStyle, value.tone]
    .some((field) => field.trim().length > 0);
}

export function setPersonaOverride(next: DjPersonaOverride | null): void {
  override = hasContent(next) ? next : null;
}

export function getPersonaOverride(): DjPersonaOverride | null {
  return override;
}

/** 把用户自定义人设追加到基础 system prompt 后。没有覆盖项时原样返回。 */
export function composePersonaPrompt(basePrompt: string): string {
  if (!hasContent(override)) return basePrompt;
  const lines: string[] = [];
  if (override.name.trim()) lines.push(`- DJ 名字: ${override.name.trim()}(用这个名字自称,替换默认名字)`);
  if (override.personaText.trim()) lines.push(`- 人设: ${override.personaText.trim()}`);
  if (override.replyStyle.trim()) lines.push(`- 回复方式: ${override.replyStyle.trim()}`);
  if (override.tone.trim()) lines.push(`- 语气: ${override.tone.trim()}`);
  return `${basePrompt}

## 听众自定义人设(优先级最高,与上文冲突时以此为准)

${lines.join("\n")}`;
}
