import { describe, expect, it, vi } from "vitest";
import { createPublicMetadataAdapter } from "./public-metadata-adapter.js";
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

describe("createPublicMetadataAdapter", () => {
  it("returns metadata source notes when MusicBrainz returns high-confidence match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        recordings: [
          {
            score: 95,
            title: "Test Song",
            "artist-credit": [{ name: "Test Artist" }],
            releases: [
              {
                title: "Test Album",
                date: "2023-06-15"
              }
            ]
          }
        ]
      })
    });

    const adapter = createPublicMetadataAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain("musicbrainz.org/ws/2/recording/");
    expect(calledUrl).toContain("Test+Song");
    expect(calledUrl).toContain("Test+Artist");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "metadata",
      title: "Test Song - Test Artist",
      content: expect.stringContaining("Test Album"),
      url: expect.stringContaining("musicbrainz.org"),
      confidence: 0.95
    });
  });

  it("returns empty array when no recordings found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recordings: [] })
    });

    const adapter = createPublicMetadataAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when best match confidence is below 0.5", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        recordings: [
          {
            score: 30,
            title: "Some Other Song",
            "artist-credit": [{ name: "Some Other Artist" }],
            releases: [{ title: "Other Album", date: "2020-01-01" }]
          }
        ]
      })
    });

    const adapter = createPublicMetadataAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("MusicBrainz down"));

    const adapter = createPublicMetadataAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("returns empty array when HTTP response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable"
    });

    const adapter = createPublicMetadataAdapter({ fetchImpl });
    const result = await adapter.gather(makeTrack());

    expect(result).toEqual([]);
  });

  it("uses default fetch when fetchImpl is not provided", async () => {
    const adapter = createPublicMetadataAdapter();
    // Should not throw when constructing; actual network call not tested here
    expect(adapter).toBeDefined();
    expect(typeof adapter.gather).toBe("function");
  });

  it("respects custom baseUrl and timeoutMs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recordings: [] })
    });

    const adapter = createPublicMetadataAdapter({
      baseUrl: "https://custom.musicbrainz.example/ws/2",
      timeoutMs: 5000,
      fetchImpl
    });

    await adapter.gather(makeTrack({ title: "Custom", artist: "Artist" }));

    expect(fetchImpl).toHaveBeenCalled();
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain("custom.musicbrainz.example");
  });
});
