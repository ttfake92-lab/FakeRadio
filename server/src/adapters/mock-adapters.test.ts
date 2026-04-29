import { describe, expect, it } from "vitest";
import {
  createMockCalendarAdapter,
  createMockDeviceAdapter,
  createMockLlmAdapter,
  createMockMusicAdapter,
  createMockTtsAdapter,
  createMockWeatherAdapter
} from "./index";

describe("mock adapters", () => {
  it("computes a valid DJ decision", async () => {
    const llm = createMockLlmAdapter();
    const decision = await llm.compute([
      {
        id: "system",
        label: "System prompt",
        content: "你是 FakeRadio DJ。",
        priority: 1,
        source: "system"
      }
    ]);

    expect(decision.say).toContain("FakeRadio");
    expect(decision.play.query).toBe("warm morning indie");
  });

  it("returns mock music, tts, weather, calendar, and devices", async () => {
    const music = createMockMusicAdapter();
    const [track] = await music.search("warm morning indie");
    expect(track?.source).toBe("mock");

    const resolved = await music.resolve(track!);
    expect(resolved.audioUrl).toContain("example.com");

    const tts = createMockTtsAdapter();
    expect((await tts.synthesize("早上好")).cacheKey).toBe("mock-tts-3");

    expect((await createMockWeatherAdapter().current()).moodHint).toBe("warm and clear");
    expect((await createMockCalendarAdapter().upcoming())).toHaveLength(1);
    expect((await createMockDeviceAdapter().list())[0]?.name).toBe("Local Browser");
  });
});
