import type { ContextFragment } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export function createDisabledLlmAdapter(reason = "LLM provider is disabled"): LlmAdapter {
  async function fail(): Promise<never> {
    throw new Error(reason);
  }

  return {
    compute: fail,
    computeRaw: async (_fragments: ContextFragment[]) => fail(),
    computeJson: fail
  };
}
