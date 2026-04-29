import { DjDecisionSchema, type DjDecision } from "@fakeradio/shared";
import type { LlmAdapter } from "../adapters/index.js";
import { buildContextWindow, type BuildContextInput } from "../context/context-builder.js";

export type ComputeDjDecisionInput = BuildContextInput & {
  llm: LlmAdapter;
};

export async function computeDjDecision(input: ComputeDjDecisionInput): Promise<DjDecision> {
  const fragments = buildContextWindow(input);
  const decision = await input.llm.compute(fragments);
  return DjDecisionSchema.parse(decision);
}
