import { DjDecisionSchema, type ContextFragment, type DjDecision } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export type CreateDeepSeekAdapterOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

// WARNING: Keep in sync with packages/shared/src/contracts/radio.ts DjDecisionSchema
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
      signal: AbortSignal.timeout(30_000)
    });

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

      return DjDecisionSchema.parse(parsed);
    },

    async computeRaw(fragments: ContextFragment[]): Promise<string> {
      const messages = fragmentsToMessages(fragments, { raw: true });
      return callDeepSeek(messages);
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
