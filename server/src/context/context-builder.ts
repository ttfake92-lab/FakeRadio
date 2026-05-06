import { formatRadioDateTime } from "../utils/time.js";
import type { ContextFragment } from "@fakeradio/shared";
import type { CalendarItem, PlaybackDevice, WeatherSnapshot } from "../adapters/types.js";

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
  recentMemory: string[];
  userMessage?: string;
  toolResults: string[];
  executionState: string;
  environment: ContextEnvironment;
};

export function buildContextWindow(input: BuildContextInput): ContextFragment[] {
  return [
    {
      id: "system",
      label: "System prompt",
      content: input.systemPrompt,
      priority: 1,
      source: "system"
    },
    {
      id: "user",
      label: "用户语料",
      content: [`taste: ${input.userTaste}`, `routines: ${input.routines}`, `moodRules: ${input.moodRules}`].join("\n"),
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
