import { DjDecisionSchema, type ContextFragment, type Track } from "@fakeradio/shared";
import type {
  CalendarAdapter,
  DeviceAdapter,
  LlmAdapter,
  MusicAdapter,
  StorySourceAdapter,
  TtsAdapter,
  WeatherAdapter
} from "../adapters/types.js";

export function createFakeMusicAdapter(tracks: Track[] = [
  { id: "fake-track-001", title: "Fake Track 1", artist: "Fake Artist", durationMs: 184000, source: "local" },
  { id: "fake-track-002", title: "Fake Track 2", artist: "Fake Artist", durationMs: 206000, source: "local" },
  { id: "fake-track-003", title: "Fake Track 3", artist: "Fake Artist", durationMs: 221000, source: "local" }
]): MusicAdapter {
  return {
    async search() {
      return tracks;
    },
    async recommend({ limit }) {
      return tracks.slice(0, limit);
    },
    async resolve(track) {
      return { ...track, audioUrl: track.audioUrl ?? `http://localhost/audio/${track.id}.mp3` };
    }
  };
}

export function createFakeTtsAdapter(): TtsAdapter {
  return {
    async synthesize(text) {
      return { text, audioUrl: "/cache/tts/fake.wav", cacheKey: "fake" };
    }
  };
}

export function createFakeStorySourceAdapter(): StorySourceAdapter {
  return {
    async gather(track) {
      return [{ kind: "metadata", title: track.title, content: `${track.title} metadata`, confidence: 0.8 }];
    }
  };
}

export function createFakeWeatherAdapter(): WeatherAdapter {
  return {
    async current() {
      return { summary: "clear", moodHint: "warm", temperatureC: 22 };
    }
  };
}

export function createFakeCalendarAdapter(): CalendarAdapter {
  return {
    async upcoming() {
      return [{ title: "Focus", start: "09:00", end: "12:00" }];
    }
  };
}

export function createFakeDeviceAdapter(): DeviceAdapter {
  return {
    async list() {
      return [{ id: "local-browser", name: "Local Browser", kind: "browser", status: "available" }];
    }
  };
}

export function createFakeLlmAdapter(): LlmAdapter {
  return {
    async computeRaw() {
      return "测试品味摘要";
    },
    async compute(fragments: ContextFragment[]) {
      const contextText = fragments.map((fragment) => fragment.content).join("\n");
      const environmentText = fragments.find((fragment) => fragment.source === "environment")?.content ?? "";
      const weatherLine = environmentText.split("\n").find((line) => line.startsWith("weather: ")) ?? "";
      const calendarLine = environmentText.split("\n").find((line) => line.startsWith("calendar: ")) ?? "";
      const devicesLine = environmentText.split("\n").find((line) => line.startsWith("devices: ")) ?? "";
      const selected = fragments
        .find((fragment) => fragment.source === "request")
        ?.content.split("\n")
        .find((line) => line.startsWith("music.selectedTrack: "))
        ?.slice("music.selectedTrack: ".length);
      const title = selected?.split(" - ")[0] ?? "Fake Track 1";
      const segue = selected ? `接上 ${title}。` : `开场接上 ${title}。`;
      if (weatherLine.includes("雨") || weatherLine.includes("rain")) {
        return DjDecisionSchema.parse({
          say: `外面有雨，${title} 可以把室内的声音压得更稳一点。`,
          play: { query: "cozy indoor acoustic", reason: `雨天场景：${title}` },
          reason: `雨天场景：${title}`,
          segue
        });
      }
      if ((weatherLine.includes("晴") || weatherLine.includes("clear")) && /^calendar:\s*$/.test(calendarLine)) {
        return DjDecisionSchema.parse({
          say: `日程很空，先让 ${title} 把节奏放松下来。`,
          play: { query: "chill ambient focus", reason: `空日程：${title}` },
          reason: `空日程：${title}`,
          segue
        });
      }
      if ((weatherLine.includes("晴") || weatherLine.includes("clear")) && /^devices:\s*$/.test(devicesLine)) {
        return DjDecisionSchema.parse({
          say: `设备列表现在是空的，我先用 ${title} 做一个稳妥的本地播放判断。`,
          play: { query: "soft background instrumental", reason: `无播放设备：${title}` },
          reason: `无播放设备：${title}`,
          segue
        });
      }
      const previous = contextText.includes("Night Window") ? "，避开刚听过的 Night Window" : "";
      return DjDecisionSchema.parse({
        say: `现在接上 ${title}，让节奏稳住。`,
        play: { query: "warm morning indie", reason: `测试选歌：${title}` },
        reason: `测试 DJ 决策：${title}${previous}`,
        segue
      });
    },
    async computeJson<T>() {
      return {
        blocks: [
          {
            role: "opening",
            title: "开场",
            storyGoal: "进入主题",
            selectionGoal: "选择开场曲",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          },
          {
            role: "origin",
            title: "起点",
            storyGoal: "讲清主题的来处",
            selectionGoal: "选择早期代表曲",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          },
          {
            role: "signature-era",
            title: "标志时刻",
            storyGoal: "展开最有辨识度的阶段",
            selectionGoal: "选择最能代表主题的曲目",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          },
          {
            role: "closing",
            title: "收束",
            storyGoal: "回到主题余味",
            selectionGoal: "选择适合收尾的曲目",
            sourceNeeds: [],
            constraints: {},
            episodeTargets: []
          }
        ]
      } as T;
    }
  };
}
