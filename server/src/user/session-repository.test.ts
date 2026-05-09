import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionRepository } from "./session-repository.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "session-test-"));
}

describe("createSessionRepository", () => {
  let dir: string;
  const fixedNow = () => new Date("2026-05-05T10:00:00Z");

  beforeEach(() => {
    dir = makeTmpDir();
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty array when no session exists", async () => {
    const repo = createSessionRepository(dir, fixedNow);
    expect(await repo.getToday()).toEqual([]);
  });

  it("appends and retrieves messages for today", async () => {
    const repo = createSessionRepository(dir, fixedNow);
    await repo.appendMessage({ timestamp: "2026-05-05T10:00:00Z", role: "user", text: "下一首" });
    await repo.appendMessage({ timestamp: "2026-05-05T10:00:01Z", role: "agent", text: "好的，换一首。" });

    const entries = await repo.getToday();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.role).toBe("user");
    expect(entries[1]!.role).toBe("agent");
  });

  it("retrieves by specific date", async () => {
    const repo = createSessionRepository(dir, fixedNow);
    await repo.appendMessage({ timestamp: "2026-05-05T10:00:00Z", role: "user", text: "hello" });

    const entries = await repo.getByDate("2026-05-05");
    expect(entries).toHaveLength(1);
  });

  it("returns empty for different date", async () => {
    const repo = createSessionRepository(dir, fixedNow);
    await repo.appendMessage({ timestamp: "2026-05-05T10:00:00Z", role: "user", text: "hello" });

    const entries = await repo.getByDate("2026-05-04");
    expect(entries).toEqual([]);
  });

  it("persists optional fields", async () => {
    const repo = createSessionRepository(dir, fixedNow);
    await repo.appendMessage({
      timestamp: "2026-05-05T10:00:00Z",
      role: "agent",
      text: "这首歌背后有个故事……",
      trackId: "t1",
      storyType: "background"
    });

    const entries = await repo.getToday();
    expect(entries[0]!.trackId).toBe("t1");
    expect(entries[0]!.storyType).toBe("background");
  });
});
