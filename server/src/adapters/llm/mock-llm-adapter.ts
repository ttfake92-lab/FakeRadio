import { DjDecisionSchema, type ContextFragment } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    async compute(fragments) {
      const groundedTrack = readGroundedTrack(fragments);
      const previousTrack = readPreviousTrack(fragments);

      if (groundedTrack) {
        return DjDecisionSchema.parse({
          say:
            previousTrack === null
              ? `现在接上 ${groundedTrack.title}，先把节奏稳稳放下来。`
              : `延续刚才 ${previousTrack.title} 的气质，现在接上 ${groundedTrack.title}。`,
          play: {
            query: "warm morning indie",
            reason: `${groundedTrack.title} 贴合当前时段，也已经是本轮真实候选里的最好入口。`
          },
          reason:
            previousTrack === null
              ? `已经拿到真实 provider 曲目 ${groundedTrack.title} - ${groundedTrack.artist}，当前口播围绕这首歌生成。`
              : `已经拿到真实 provider 曲目 ${groundedTrack.title} - ${groundedTrack.artist}，并延续上一首 ${previousTrack.title} 的氛围。`,
          segue: `从 ${groundedTrack.title} 自然切入。`
        });
      }

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

function readGroundedTrack(fragments: ContextFragment[]) {
  const requestFragment = fragments.find((fragment) => fragment.source === "request");
  const selectedTrackLine = requestFragment?.content
    .split("\n")
    .find((line) => line.startsWith("music.selectedTrack: "));

  if (!selectedTrackLine) {
    return null;
  }

  const value = selectedTrackLine.slice("music.selectedTrack: ".length).trim();
  const separator = value.lastIndexOf(" - ");

  if (separator === -1) {
    return {
      title: value,
      artist: "Unknown Artist"
    };
  }

  return {
    title: value.slice(0, separator).trim(),
    artist: value.slice(separator + 3).trim()
  };
}

function readPreviousTrack(fragments: ContextFragment[]) {
  const memoryFragment = fragments.find((fragment) => fragment.source === "memory");
  const lastPlayedLine = memoryFragment?.content
    .split("\n")
    .filter(Boolean)
    .reverse()
    .find((line) => line.startsWith("playedTrack: "));

  if (!lastPlayedLine) {
    return null;
  }

  const value = lastPlayedLine.slice("playedTrack: ".length).trim();
  const separator = value.lastIndexOf(" - ");

  if (separator === -1) {
    return {
      title: value,
      artist: "Unknown Artist"
    };
  }

  return {
    title: value.slice(0, separator).trim(),
    artist: value.slice(separator + 3).trim()
  };
}
