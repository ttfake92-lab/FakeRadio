import { formatRadioDateTime } from "../utils/time.js";
import type { ContextFragment, Track } from "@fakeradio/shared";
import type { CalendarItem, PlaybackDevice, WeatherSnapshot } from "../adapters/types.js";
import { composePersonaPrompt } from "../user/dj-persona-store.js";

export type ContextEnvironment = {
  weather: WeatherSnapshot;
  calendar: CalendarItem[];
  devices: PlaybackDevice[];
};

export type BuildContextInput = {
  now: Date;
  systemPrompt: string;
  userTaste: string;
  routines: string;
  moodRules: string;
  /** 个人画像(profile.md);为空就不注入 */
  profile?: string;
  /** 用户明确不喜欢的摘要(近期单曲 + 高频雷区艺术家);为空就不注入。选歌和口播都必须避开。 */
  dislikes?: string;
  recentMemory: string[];
  userMessage?: string;
  toolResults: string[];
  executionState: string;
  environment: ContextEnvironment;
  candidates?: Track[];
};

export function buildContextWindow(input: BuildContextInput): ContextFragment[] {
  const userLines = [
    `taste: ${input.userTaste}`,
    `routines: ${input.routines}`,
    `moodRules: ${input.moodRules}`
  ];
  if (input.profile && input.profile.trim().length > 0) {
    userLines.unshift(`profile: ${input.profile.trim()}`);
  }
  if (input.dislikes && input.dislikes.trim().length > 0) {
    userLines.push(`dislikes(用户明确不喜欢,选歌与口播都要避开): ${input.dislikes.trim()}`);
  }
  return [
    {
      id: "system",
      label: "System prompt",
      // 用户自定义 DJ 人设(名字/回复方式/语气)在这里统一追加——
      // 这是所有 DJ LLM 调用的汇聚点,编辑人设后无需重启即对聊天/口播/预热生效。
      content: composePersonaPrompt(input.systemPrompt),
      priority: 1,
      source: "system"
    },
    {
      id: "user",
      label: "用户语料",
      content: userLines.join("\n"),
      priority: 2,
      source: "user"
    },
    {
      id: "environment",
      label: "环境注入",
      content: [
        `now: ${formatRadioDateTime(input.now)}`,
        `weather: ${formatWeather(input.environment.weather)}`,
        `calendar: ${formatCalendar(input.environment.calendar)}`,
        `devices: ${formatDevices(input.environment.devices)}`
      ].join("\n"),
      priority: 3,
      source: "environment"
    },
    {
      id: "memory",
      label: "已检索记忆",
      content: input.recentMemory.join("\n"),
      priority: 4,
      source: "memory"
    },
    ...(input.candidates && input.candidates.length > 0
      ? [
          {
            id: "candidates" as const,
            label: "候选曲目列表" as const,
            content: formatCandidates(input.candidates),
            priority: 4.5 as const,
            source: "request" as const
          }
        ]
      : []),
    {
      id: "request",
      label: "用户输入和工具结果",
      content: [`message: ${input.userMessage ?? ""}`, ...input.toolResults].join("\n"),
      priority: 5,
      source: "request"
    },
    {
      id: "execution",
      label: "执行轨迹",
      content: input.executionState,
      priority: 6,
      source: "execution"
    }
  ];
}

function formatWeather(weather: WeatherSnapshot): string {
  const parts = [weather.summary, weather.moodHint];
  if (weather.temperatureC !== undefined) {
    parts.push(`${weather.temperatureC}C`);
  }
  return parts.join(", ");
}

function formatCalendar(calendar: CalendarItem[]): string {
  return calendar.map((item) => `${item.start} ${item.title}`).join(", ");
}

function formatDevices(devices: PlaybackDevice[]): string {
  return devices.map((device) => `${device.name} ${device.status}`).join(", ");
}

function formatCandidates(candidates: Track[]): string {
  return candidates
    .map((t) => `[${t.id}] ${t.title} - ${t.artist} (${t.album ?? "unknown"}, source: ${t.source})`)
    .join("\n");
}
