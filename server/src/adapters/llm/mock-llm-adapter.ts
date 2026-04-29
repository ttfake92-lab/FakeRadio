import { DjDecisionSchema } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    async compute() {
      return DjDecisionSchema.parse({
        say: "FakeRadio 已经准备好，我们先用一首温暖、轻盈的歌把状态打开。",
        play: {
          query: "warm morning indie",
          reason: "mock 模式下默认选择低刺激、适合开始工作的音乐。"
        },
        reason: "当前没有真实 provider 输入，使用稳定的 mock 决策验证流程。",
        segue: "从柔和的开场进入播放。"
      });
    }
  };
}
