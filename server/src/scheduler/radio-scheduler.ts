import { formatRadioDate } from "../utils/time.js";
import type { TodayPlanResponse } from "@fakeradio/shared";

type PlaylistInput = {
  name: string;
  seeds: string[];
};

export function buildTodayPlan(now: Date, playlists?: PlaylistInput[]): TodayPlanResponse {
  const date = formatRadioDate(now);

  const defaultBlocks = [
    { at: "00:00", label: "午夜静谧", moodHint: "ambient sleep" },
    { at: "07:00", label: "早晨轻启动", moodHint: "warm morning indie" },
    { at: "09:00", label: "写代码专注", moodHint: "instrumental focus" },
    { at: "12:00", label: "午间轻松", moodHint: "light acoustic" },
    { at: "14:00", label: "下午专注", moodHint: "deep focus electronic" },
    { at: "21:00", label: "晚间降速", moodHint: "ambient pop night" }
  ];

  if (!playlists || playlists.length === 0) {
    return { date, blocks: defaultBlocks };
  }

  const timeSlots = ["00:00", "07:00", "09:00", "12:00", "14:00", "21:00"];
  const blocks = playlists.map((playlist, index) => ({
    at: timeSlots[index] ?? defaultBlocks[index]?.at ?? "07:00",
    label: playlist.name,
    moodHint: playlist.seeds[0] ?? defaultBlocks[index]?.moodHint ?? "warm morning indie"
  }));

  return { date, blocks };
}

export function getCurrentPlanBlock(plan: TodayPlanResponse, now: Date) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let selected = plan.blocks[0] ?? null;

  for (const block of plan.blocks) {
    const [rawHours, rawMinutes] = block.at.split(":");
    const hours = Number(rawHours ?? 0);
    const minutes = Number(rawMinutes ?? 0);
    const blockMinutes = hours * 60 + minutes;

    if (blockMinutes <= currentMinutes) {
      selected = block;
    }
  }

  return selected;
}
