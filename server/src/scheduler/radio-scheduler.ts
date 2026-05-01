import type { TodayPlanResponse } from "@fakeradio/shared";

export function buildTodayPlan(now: Date): TodayPlanResponse {
  const date = now.toLocaleDateString("en-CA");

  return {
    date,
    blocks: [
      {
        at: "07:00",
        label: "早晨轻启动",
        moodHint: "warm morning indie"
      },
      {
        at: "09:00",
        label: "写代码专注",
        moodHint: "instrumental focus"
      },
      {
        at: "21:00",
        label: "晚间降速",
        moodHint: "ambient pop night"
      }
    ]
  };
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
