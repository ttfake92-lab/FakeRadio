import { describe, expect, it, vi } from "vitest";
import { createDeepSeekAdapter } from "./deepseek-llm-adapter.js";
import type { ContextFragment } from "@fakeradio/shared";

function makeFragments(overrides: Partial<ContextFragment>[] = []): ContextFragment[] {
  const defaults: ContextFragment[] = [
    { id: "system", label: "System prompt", content: "你是 FakeRadio DJ。", priority: 1, source: "system" },
    { id: "user", label: "用户语料", content: "taste: 喜欢低刺激音乐", priority: 2, source: "user" },
    { id: "environment", label: "环境注入", content: "now: 2026-05-02T10:00:00Z\nweather: 晴天, warm", priority: 3, source: "environment" },
    { id: "memory", label: "已检索记忆", content: "", priority: 4, source: "memory" },
    { id: "request", label: "用户输入和工具结果", content: "message: \nmusic.selectedTrack: Morning Signal - FakeRadio Session", priority: 5, source: "request" },
    { id: "execution", label: "执行轨迹", content: "now playing: Morning Signal", priority: 6, source: "execution" }
  ];

  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

const validDecision = {
  say: "现在接上 Morning Signal，先把节奏稳稳放下来。",
  play: { query: "warm morning indie", reason: "贴合当前时段" },
  reason: "基于真实曲目生成",
  segue: "从 Morning Signal 自然切入。"
};

describe("createDeepSeekAdapter", () => {
  it("assembles fragments into system + user messages", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await adapter.compute(makeFragments());

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("你是 FakeRadio DJ。");
    expect(body.messages[0].content).toContain('"say"');
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("[用户语料]");
    expect(body.messages[1].content).toContain("[环境注入]");

    vi.restoreAllMocks();
  });

  it("sends Authorization header with API key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "sk-my-key" });
    await adapter.compute(makeFragments());

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer sk-my-key");

    vi.restoreAllMocks();
  });

  it("uses custom model and baseUrl", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({
      apiKey: "test-key",
      model: "deepseek-chat",
      baseUrl: "https://custom.api.com/v2"
    });
    await adapter.compute(makeFragments());

    expect(fetchSpy.mock.calls[0][0]).toBe("https://custom.api.com/v2/chat/completions");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.model).toBe("deepseek-chat");

    vi.restoreAllMocks();
  });

  it("returns parsed DjDecision on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    const result = await adapter.compute(makeFragments());

    expect(result.say).toBe(validDecision.say);
    expect(result.play.query).toBe(validDecision.play.query);
    expect(result.reason).toBe(validDecision.reason);

    vi.restoreAllMocks();
  });

  it("throws on API error status", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized")
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "bad-key" });
    await expect(adapter.compute(makeFragments())).rejects.toThrow("DeepSeek API error 401");

    vi.restoreAllMocks();
  });

  it("throws on empty response content", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "" } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await expect(adapter.compute(makeFragments())).rejects.toThrow("empty content");

    vi.restoreAllMocks();
  });

  it("throws on invalid JSON response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "not json" } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await expect(adapter.compute(makeFragments())).rejects.toThrow("invalid JSON");

    vi.restoreAllMocks();
  });

  it("throws when response does not match DjDecision schema", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '{"say":"hi"}' } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await expect(adapter.compute(makeFragments())).rejects.toThrow();

    vi.restoreAllMocks();
  });

  it("requests json_object response format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await adapter.compute(makeFragments());

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });

    vi.restoreAllMocks();
  });

  it("passes 30s AbortSignal.timeout to fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(validDecision) } }] })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await adapter.compute(makeFragments());

    const signal = fetchSpy.mock.calls[0][1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    vi.restoreAllMocks();
  });

  it("propagates timeout error from fetch", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createDeepSeekAdapter({ apiKey: "test-key" });
    await expect(adapter.compute(makeFragments())).rejects.toThrow();

    vi.restoreAllMocks();
  });
});
