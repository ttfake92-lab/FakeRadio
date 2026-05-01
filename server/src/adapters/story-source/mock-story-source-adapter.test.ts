import { describe, expect, it } from "vitest";
import { createMockStorySourceAdapter } from "./mock-story-source-adapter.js";

describe("mock story source adapter", () => {
  it("returns mock source notes for a track", async () => {
    const adapter = createMockStorySourceAdapter();
    const sources = await adapter.gather({
      id: "mock-track-001",
      title: "Morning Signal",
      artist: "FakeRadio Session",
      source: "mock"
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].kind).toBe("mock");
    expect(sources[0].title).toBe("mock source");
    expect(sources[0].content.length).toBeGreaterThan(0);
  });
});
