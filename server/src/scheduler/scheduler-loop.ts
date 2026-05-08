import type { TodayPlanResponse } from "@fakeradio/shared";
import { getCurrentPlanBlock } from "./radio-scheduler.js";

export type SchedulerLoop = {
  start(): void;
  stop(): void;
};

export function createSchedulerLoop(options: {
  intervalMs?: number;
  onDaypartChange?(block: TodayPlanResponse["blocks"][number]): void;
  onHourlyTick?(hour: number): void;
  nowProvider(): Date;
  planBuilder(now: Date): TodayPlanResponse;
}): SchedulerLoop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastBlockAt: string | null = null;
  let lastHour = -1;

  return {
    start() {
      const tick = () => {
        const now = options.nowProvider();
        const plan = options.planBuilder(now);
        const block = getCurrentPlanBlock(plan, now);
        if (block !== null && block?.at !== lastBlockAt) {
          lastBlockAt = block.at;
          options.onDaypartChange?.(block);
        }
        const currentHour = now.getHours();
        if (currentHour !== lastHour) {
          lastHour = currentHour;
          options.onHourlyTick?.(currentHour);
        }
      };
      tick();
      timer = setInterval(tick, options.intervalMs ?? 60_000);
    },
    stop() {
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
  };
}
