import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPrewarmScheduler } from "./scheduler-loop.js";

describe("createPrewarmScheduler", () => {
  let tickCount: number;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    tickCount = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"));
  });

  it("does not start timer when prewarmEnabled is false", () => {
    const scheduler = createPrewarmScheduler({
      prewarmTime: "23:59",
      prewarmEnabled: false,
      nowProvider: () => new Date(),
      onPrewarmTick: () => { tickCount++; }
    });
    scheduler.start();
    expect(tickCount).toBe(0);
    scheduler.stop();
  });

  it("starts and stops without errors", () => {
    const scheduler = createPrewarmScheduler({
      prewarmTime: "23:59",
      prewarmEnabled: true,
      nowProvider: () => new Date(),
      onPrewarmTick: () => { tickCount++; }
    });
    scheduler.start();
    scheduler.stop();
    expect(tickCount).toBe(0);
  });

  it("fires onPrewarmTick when target time is reached", async () => {
    const scheduler = createPrewarmScheduler({
      prewarmTime: "23:59",
      prewarmEnabled: true,
      nowProvider: () => new Date(vi.getMockedSystemTime()!.getTime()),
      onPrewarmTick: () => { tickCount++; }
    });
    scheduler.start();
    vi.setSystemTime(new Date("2026-05-12T23:59:00.000Z"));
    await vi.advanceTimersByTimeAsync(86_394_000); // 23h59m = 23*3600*1000 + 59*60*1000
    expect(tickCount).toBe(1);
    scheduler.stop();
  });

  it("fires only once per calendar day", async () => {
    const scheduler = createPrewarmScheduler({
      prewarmTime: "23:59",
      prewarmEnabled: true,
      nowProvider: () => new Date(vi.getMockedSystemTime()!.getTime()),
      onPrewarmTick: () => { tickCount++; }
    });
    scheduler.start();
    vi.setSystemTime(new Date("2026-05-12T23:59:00.000Z"));
    await vi.advanceTimersByTimeAsync(86_394_000);
    expect(tickCount).toBe(1);
    await vi.advanceTimersByTimeAsync(86_394_000);
    expect(tickCount).toBe(2);
    scheduler.stop();
  });
});
