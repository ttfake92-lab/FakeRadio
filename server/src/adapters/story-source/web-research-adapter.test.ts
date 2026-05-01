import { describe, expect, it, vi } from "vitest";
import { createWebResearchAdapter } from "./web-research-adapter.js";
import type { Track } from "@fakeradio/shared";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "123456",
    title: "Test Song",
    artist: "Test Artist",
    album: "Test Album",
    source: "netease",
    ...overrides
  };
}

function makeSuccessResponse(results: Array<{ title: string; url: string; description?: string }>) {
  return {
    ok: true,
    json: async () => ({
      web: { results }
    })
  };
}

describe("createWebResearchAdapter", () => {
  it("returns up to 3 web source notes with rank-based confidence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSuccessResponse([
        { title: "Test Song by Test Artist — Song Meanings", url: "https://example.com/1", description: "First result description" },
        { title: "Test Artist Interview About Test Song", url: "https://example.com/2", description: "Second result description" },
        { title: "Album Review Featuring Test Song", url: "https://example.com/3", description: "Third result description" },
        { title: "Extra Result That Should Be Cut", url: "https://example.com/4", description: "Should not appear" }
      ])
    );

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain("brave.com");
    expect(calledUrl).toContain("Test+Song");
    expect(calledUrl).toContain("Test+Artist");
    expect(calledUrl).toContain("song+meaning+background+interview");

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      kind: "web",
      title: "Test Song by Test Artist — Song Meanings",
      content: "First result description",
      url: "https://example.com/1",
      confidence: 0.6
    });
    expect(result[1]).toMatchObject({
      confidence: 0.4
    });
    expect(result[2]).toMatchObject({
      confidence: 0.3
    });
  });

  it("uses title as content when description is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSuccessResponse([
        {
          title: "Test Song — Only Title Available",
          url: "https://example.com/no-desc"
        }
      ])
    );

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Test Song — Only Title Available");
  });

  it("returns empty array when less than 3 results are available", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSuccessResponse([
        { title: "Only Result", url: "https://example.com/1", description: "Single description" }
      ])
    );

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.6);
  });

  it("returns empty array when no API key is provided", async () => {
    const fetchImpl = vi.fn();

    const adapter = createWebResearchAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns empty array when API key is empty string", async () => {
    const fetchImpl = vi.fn();

    const adapter = createWebResearchAdapter({
      apiKey: "",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns empty array when search returns no web results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } })
    });

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when search response has no web key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when HTTP response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized"
    });

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("Network error"));

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when JSON parsing fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      }
    });

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("uses default fetch when fetchImpl is not provided", async () => {
    const adapter = createWebResearchAdapter({ apiKey: "test-key" });
    expect(adapter).toBeDefined();
    expect(typeof adapter.gather).toBe("function");
  });

  it("sends Brave Search API key via X-Subscription-Token header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSuccessResponse([])
    );

    const adapter = createWebResearchAdapter({
      apiKey: "secret-brave-key-123",
      fetchImpl
    });
    await adapter.gather(makeTrack());

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Subscription-Token": "secret-brave-key-123"
        })
      })
    );
  });

  it("sets Accept and Accept-Encoding headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSuccessResponse([])
    );

    const adapter = createWebResearchAdapter({
      apiKey: "test-key",
      fetchImpl
    });
    await adapter.gather(makeTrack());

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "Accept-Encoding": "gzip"
        })
      })
    );
  });
});
