import { DjDecisionSchema, type ContextFragment, type DjDecision } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export type CreateDeepSeekAdapterOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) result[k] = stripNulls(v);
    }
    return result;
  }
  return value;
}
const JSON_SCHEMA_INSTRUCTION = `

You must respond with valid JSON matching this exact schema:
{
  "say": "string - your DJ narration text, spoken to the listener",
  "play": {
    "query": "string - music search query (optional)",
    "trackId": "string - specific track ID to play (optional)",
    "reason": "string - why you chose this music"
  },
  "reason": "string - your reasoning for this decision",
  "segue": "string - a short transition phrase"
}
The "play" object must have either "query" or "trackId", plus "reason".`;

export function createDeepSeekAdapter(options: CreateDeepSeekAdapterOptions): LlmAdapter {
  const model = options.model ?? "deepseek-v4-flash";
  const baseUrl = (options.baseUrl ?? "https://api.deepseek.com/v1").replace(/\/$/, "");

  async function callDeepSeek(
    messages: { role: "system" | "user"; content: string }[],
    responseFormat?: "json_object"
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
          temperature: 0.7,
          max_tokens: 4096
        }),
        signal: AbortSignal.timeout(60_000)
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error("LLM 生成超时（60s），请重试");
      }
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek API returned empty content");
    }

    return content;
  }

  return {
    async compute(fragments: ContextFragment[]): Promise<DjDecision> {
      const messages = fragmentsToMessages(fragments);
      const content = await callDeepSeek(messages, "json_object");

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(`DeepSeek API returned invalid JSON: ${content.slice(0, 200)}`);
      }

      // DeepSeek sometimes returns null instead of omitting a field — strip nulls
      const sanitized = stripNulls(parsed);

      const strict = DjDecisionSchema.safeParse(sanitized);
      if (strict.success) return strict.data;

      // 容错：纯聊天轮次模型常省略 play/segue/reason。只要 say 在，
      // 缺失字段补默认值，不让一次格式瑕疵毁掉整轮对话
      const candidate = sanitized as Record<string, unknown>;
      if (typeof candidate?.say === "string" && candidate.say.trim().length > 0) {
        const playRaw = (typeof candidate.play === "object" && candidate.play !== null)
          ? candidate.play as Record<string, unknown>
          : {};
        const repaired = {
          say: candidate.say,
          play: {
            ...(typeof playRaw.query === "string" && playRaw.query.length > 0 ? { query: playRaw.query } : {}),
            ...(typeof playRaw.trackId === "string" && playRaw.trackId.length > 0 ? { trackId: playRaw.trackId } : {}),
            reason: typeof playRaw.reason === "string" && playRaw.reason.length > 0 ? playRaw.reason : "keep current mood"
          },
          reason: typeof candidate.reason === "string" && candidate.reason.length > 0 ? candidate.reason : "chat reply",
          segue: typeof candidate.segue === "string" && candidate.segue.length > 0 ? candidate.segue : "继续。"
        };
        if (!("query" in repaired.play) && !("trackId" in repaired.play)) {
          (repaired.play as Record<string, unknown>).query = "keep current";
        }
        const salvaged = DjDecisionSchema.safeParse(repaired);
        if (salvaged.success) return salvaged.data;
      }

      throw new Error(`DeepSeek response failed DjDecision schema: ${strict.error.message.slice(0, 200)}`);
    },

    async computeRaw(fragments: ContextFragment[]): Promise<string> {
      const messages = fragmentsToMessages(fragments, { raw: true });
      return callDeepSeek(messages);
    },

    async computeJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
      const messages: { role: "system" | "user"; content: string }[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];
      const content = await callDeepSeek(messages, "json_object");

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(`LLM returned invalid JSON: ${content.slice(0, 200)}`);
      }

      return stripNulls(parsed) as T;
    }
  };
}

function fragmentsToMessages(fragments: ContextFragment[], options?: { raw?: boolean }) {
  const systemFragment = fragments.find((f) => f.source === "system");
  const otherFragments = fragments.filter((f) => f.source !== "system");

  const messages: { role: "system" | "user"; content: string }[] = [];

  if (systemFragment) {
    messages.push({
      role: "system",
      content: options?.raw ? systemFragment.content : `${systemFragment.content}${JSON_SCHEMA_INSTRUCTION}`
    });
  }

  const userContent = otherFragments.map((f) => `[${f.label}]\n${f.content}`).join("\n\n");
  if (userContent.length > 0) {
    messages.push({ role: "user", content: userContent });
  }

  return messages;
}
