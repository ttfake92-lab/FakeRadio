import { describe, expect, it } from "vitest";
import { createTrackRegistry } from "./track-registry.js";
import type { Track } from "@fakeradio/shared";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "t1",
    title: "Song A",
    artist: "Artist A",
    source: "local",
    ...overrides
  };
}

describe("createTrackRegistry", () => {
  it("returns undefined for unknown trackId", () => {
    const registry = createTrackRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("registers and retrieves a track with audioUrl", () => {
    const registry = createTrackRegistry();
    const track = makeTrack({ audioUrl: "https://example.com/audio.mp3" });
    registry.register(track);

    expect(registry.get("t1")).toEqual(track);
  });

  it("does not register a track without audioUrl", () => {
    const registry = createTrackRegistry();
    const track = makeTrack(); // no audioUrl
    registry.register(track);

    expect(registry.get("t1")).toBeUndefined();
  });

  it("overwrites previously registered track", () => {
    const registry = createTrackRegistry();
    registry.register(makeTrack({ audioUrl: "https://old.com/a.mp3" }));
    registry.register(makeTrack({ audioUrl: "https://new.com/a.mp3" }));

    expect(registry.get("t1")?.audioUrl).toBe("https://new.com/a.mp3");
  });
});
