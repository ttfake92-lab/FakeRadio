import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTypewriter } from "./typewriter";

describe("createTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals pushed text gradually, not all at once", () => {
    const updates: string[] = [];
    const tw = createTypewriter({
      onUpdate: (t) => updates.push(t),
      onDone: () => {},
      intervalMs: 10
    });
    tw.push("这是一段比较长的口播文本内容");

    vi.advanceTimersByTime(10);
    expect(updates.length).toBe(1);
    expect(updates[0]!.length).toBeLessThan("这是一段比较长的口播文本内容".length);

    vi.advanceTimersByTime(500);
    expect(updates[updates.length - 1]).toBe("这是一段比较长的口播文本内容");
  });

  it("fires onDone with final text after queue drains", () => {
    const done = vi.fn();
    const tw = createTypewriter({ onUpdate: () => {}, onDone: done, intervalMs: 10 });
    tw.push("你好");
    tw.finish("你好，想听点什么？");
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledWith("你好，想听点什么？");
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("finalizes immediately when final text mismatches shown text", () => {
    const done = vi.fn();
    const updates: string[] = [];
    const tw = createTypewriter({ onUpdate: (t) => updates.push(t), onDone: done, intervalMs: 10 });
    tw.push("一些将被替换的内容");
    vi.advanceTimersByTime(30);
    tw.finish("信号断了。再说一次？");
    expect(done).toHaveBeenCalledWith("信号断了。再说一次？");
    expect(updates[updates.length - 1]).toBe("信号断了。再说一次？");
  });

  it("stops all output after cancel", () => {
    const updates: string[] = [];
    const done = vi.fn();
    const tw = createTypewriter({ onUpdate: (t) => updates.push(t), onDone: done, intervalMs: 10 });
    tw.push("不该出现的文本");
    tw.cancel();
    vi.advanceTimersByTime(1000);
    expect(updates).toEqual([]);
    expect(done).not.toHaveBeenCalled();
  });

  it("types out finish-only text (no prior pushes) and completes", () => {
    const done = vi.fn();
    const updates: string[] = [];
    const tw = createTypewriter({ onUpdate: (t) => updates.push(t), onDone: done, intervalMs: 10 });
    tw.finish("直接定稿的文本");
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledWith("直接定稿的文本");
    expect(updates[updates.length - 1]).toBe("直接定稿的文本");
  });
});
