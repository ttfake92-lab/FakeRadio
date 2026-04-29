import type { TodayPlanResponse } from "@fakeradio/shared";

export function buildTodayPlan(now: Date): TodayPlanResponse {
  const date = now.toISOString().slice(0, 10);

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
