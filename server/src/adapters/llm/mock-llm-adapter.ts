import { DjDecisionSchema, type ContextFragment } from "@fakeradio/shared";
import type { LlmAdapter } from "../types.js";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    async compute(fragments) {
      const groundedTrack = readGroundedTrack(fragments);
      const previousTrack = readPreviousTrack(fragments);
      const env = readEnvironment(fragments);

      if (groundedTrack) {
        const say = buildGroundedSay(groundedTrack, previousTrack, env);
        const playQuery = buildPlayQuery(env);
        return DjDecisionSchema.parse({
          say,
          play: {
            query: playQuery,
            reason: `${groundedTrack.title} 贴合当前时段，也已经是本轮真实候选里的最好入口。`
          },
          reason:
            previousTrack === null
              ? `已经拿到真实 provider 曲目 ${groundedTrack.title} - ${groundedTrack.artist}，当前口播围绕这首歌生成。`
              : `已经拿到真实 provider 曲目 ${groundedTrack.title} - ${groundedTrack.artist}，并延续上一首 ${previousTrack.title} 的氛围。`,
          segue: `从 ${groundedTrack.title} 自然切入。`
        });
      }

      const say = buildDefaultSay(env);
      const playQuery = buildPlayQuery(env);
      return DjDecisionSchema.parse({
        say,
        play: {
          query: playQuery,
          reason: env.isRaining
            ? "外面在下雨，选一首适合室内窝着的音乐。"
            : env.calendarEmpty
              ? "今天日程很空，用轻松的音乐填满空间。"
              : "mock 模式下默认选择低刺激、适合开始工作的音乐。"
        },
        reason: "当前没有真实 provider 输入，使用稳定的 mock 决策验证流程。",
        segue: "从柔和的开场进入播放。"
      });
    }
  };
}

function buildGroundedSay(
  groundedTrack: { title: string; artist: string },
  previousTrack: { title: string; artist: string } | null,
  env: EnvironmentState
) {
  const base =
    previousTrack === null
      ? `现在接上 ${groundedTrack.title}，先把节奏稳稳放下来。`
      : `延续刚才 ${previousTrack.title} 的气质，现在接上 ${groundedTrack.title}。`;

  if (env.isRaining) {
    return `外面飘着雨，${base}`;
  }
  if (env.calendarEmpty) {
    return `今天日程很空，${base}`;
  }
  if (env.noDevices) {
    return `设备暂不可用，${base}`;
  }
  return base;
}

function buildDefaultSay(env: EnvironmentState) {
  if (env.isRaining) {
    return "外面在下雨，FakeRadio 陪你窝在室内，先来一首舒服的歌。";
  }
  if (env.calendarEmpty) {
    return "今天日程很空，FakeRadio 帮你用音乐把节奏填满。";
  }
  if (env.noDevices) {
    return "设备暂不可用，FakeRadio 先准备好音乐，等设备恢复就能直接播放。";
  }
  return "FakeRadio 已经准备好，我们先用一首温暖、轻盈的歌把状态打开。";
}

function buildPlayQuery(env: EnvironmentState) {
  if (env.isRaining) {
    return "cozy indoor acoustic";
  }
  if (env.calendarEmpty) {
    return "chill ambient focus";
  }
  if (env.noDevices) {
    return "soft background instrumental";
  }
  return "warm morning indie";
}

type EnvironmentState = {
  isRaining: boolean;
  calendarEmpty: boolean;
  noDevices: boolean;
};

function readEnvironment(fragments: ContextFragment[]): EnvironmentState {
  const envFragment = fragments.find((fragment) => fragment.source === "environment");

  if (!envFragment) {
    return {
      isRaining: false,
      calendarEmpty: false,
      noDevices: false
    };
  }

  const content = envFragment.content;

  const weatherLine = content.split("\n").find((line) => line.startsWith("weather: "));
  const weather = weatherLine ? weatherLine.slice("weather: ".length).trim() : "";

  const calendarLine = content.split("\n").find((line) => line.startsWith("calendar: "));
  const calendar = calendarLine ? calendarLine.slice("calendar: ".length).trim() : "";

  const devicesLine = content.split("\n").find((line) => line.startsWith("devices: "));
  const devices = devicesLine ? devicesLine.slice("devices: ".length).trim() : "";

  return {
    isRaining: weather.includes("雨"),
    calendarEmpty: calendar.length === 0,
    noDevices: devices.length === 0 || !devices.includes("available")
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
