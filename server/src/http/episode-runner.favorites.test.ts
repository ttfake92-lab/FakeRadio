import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EpisodeRunnerDeps } from "./episode-runner.js";
import { resolveNextTrackAndDecision } from "./episode-runner.js";
import type { LikedSongsRepository } from "../user/liked-songs-repository.js";
import type { MusicAdapter } from "../adapters/types.js";
import type { Track } from "@fakeradio/shared";
import { createPlaybackState } from "./playback-state.js";

function makeTrack(id: string, title: string, artist: string = "Test Artist"): Track {
  return { id, title, artist, album: "Test Album", durationMs: 180000, source: "netease" };
}

function createMockLikedSongsRepo(tracks: Track[]): LikedSongsRepository {
  return {
    getDiagnostics: vi.fn().mockResolvedValue({
      loaded: true,
      totalCount: tracks.length,
      validCount: tracks.length,
      invalidCount: 0,
      samples: tracks.slice(0, 3).map((t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album }))
    }),
    list: vi.fn().mockResolvedValue(tracks)
  };
}

function createFakeMusicAdapter(): MusicAdapter {
  return {
    search: vi.fn().mockResolvedValue([makeTrack("search-001", "Search Result")]),
    recommend: vi.fn().mockResolvedValue([makeTrack("queue-001", "Queue Result")]),
    resolve: vi.fn().mockImplementation(async (track: Track) => ({
      ...track,
      audioUrl: `https://example.com/audio/${track.id}.mp3`
    }))
  };
}

function createFakeLlmAdapter() {
  return {
    compute: vi.fn().mockResolvedValue({
      say: "Here is a track for you.",
      play: { query: "warm morning indie", reason: "Test reason" },
      segue: "Now playing...",
      reason: "Test reason"
    })
  };
}

function createFakeWeatherAdapter() {
  return {
    current: vi.fn().mockResolvedValue({ summary: "Sunny", moodHint: "warm", temperatureC: 22 })
  };
}

function createFakeCalendarAdapter() {
  return {
    upcoming: vi.fn().mockResolvedValue([])
  };
}

function createFakeDeviceAdapter() {
  return {
    list: vi.fn().mockResolvedValue([{ name: "Local Browser", type: "browser" }])
  };
}

function createMockMemoryRepository() {
  return {
    recent: vi.fn().mockResolvedValue([]),
    append: vi.fn().mockResolvedValue(undefined)
  };
}

function buildDeps(overrides: Partial<EpisodeRunnerDeps> & { likedSongs?: LikedSongsRepository; music?: MusicAdapter }): EpisodeRunnerDeps {
  const likedSongs = overrides.likedSongs ?? createMockLikedSongsRepo([]);
  const music = overrides.music ?? createFakeMusicAdapter();
  const state = overrides.state ?? createPlaybackState([]);

  return {
    llm: (overrides.llm ?? createFakeLlmAdapter()) as EpisodeRunnerDeps["llm"],
    music: music as EpisodeRunnerDeps["music"],
    tts: { synthesize: vi.fn().mockResolvedValue({ audioUrl: "/cache/tts/mock.wav", text: "test" }) } as EpisodeRunnerDeps["tts"],
    ttsCacheDir: "/tmp/tts",
    weather: createFakeWeatherAdapter() as EpisodeRunnerDeps["weather"],
    calendar: createFakeCalendarAdapter() as EpisodeRunnerDeps["calendar"],
    devices: createFakeDeviceAdapter() as EpisodeRunnerDeps["devices"],
    storySource: { gather: vi.fn().mockResolvedValue([]) } as EpisodeRunnerDeps["storySource"],
    publicMetadataAdapter: undefined,
    webResearchAdapter: undefined,
    memory: createMockMemoryRepository() as EpisodeRunnerDeps["memory"],
    state: state as EpisodeRunnerDeps["state"],
    systemPrompt: "You are FakeRadio DJ.",
    userPreferences: {
      taste: "test taste",
      routines: "test routines",
      moodRules: "test mood rules",
      playlists: []
    } as EpisodeRunnerDeps["userPreferences"],
    musicStatus: "ready",
    currentMoodHint: "warm morning indie",
    nowProvider: () => new Date(2026, 3, 30, 8, 0, 0),
    likedSongs: likedSongs as EpisodeRunnerDeps["likedSongs"]
  };
}

describe("resolveNextTrackAndDecision favorites-backed candidate selection", () => {
  describe("candidateSource", () => {
    it("is 'favorites' when a favorite candidate is available and resolved", async () => {
      const favTrack = makeTrack("fav-001", "Favorite Track");
      const likedSongs = createMockLikedSongsRepo([favTrack]);
      const music = createFakeMusicAdapter();
      const deps = buildDeps({ likedSongs, music });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("favorites");
      expect(result.track.title).toBe("Favorite Track");
      expect(music.resolve).toHaveBeenCalledWith(favTrack);
    });

    it("is 'search' when favorites list is empty", async () => {
      const likedSongs = createMockLikedSongsRepo([]);
      const music = createFakeMusicAdapter();
      const deps = buildDeps({ likedSongs, music });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("search");
      expect(result.track.title).toBe("Search Result");
    });

    it("is 'search' when favorite candidate cannot be resolved", async () => {
      const favTrack = makeTrack("fav-001", "Unresolvable Favorite");
      const searchTrack = makeTrack("search-001", "Search Result");
      const likedSongs = createMockLikedSongsRepo([favTrack]);
      // Use createFakeMusicAdapter as base (works in other tests) and override resolve
      // to reject only for the favorite track, succeed for search track
      const music = createFakeMusicAdapter();
      music.search = vi.fn().mockResolvedValue([searchTrack]);
      music.resolve = vi.fn().mockImplementation(async (track: Track) => {
        if (track.id === "fav-001") {
          throw new Error("cannot resolve");
        }
        return { ...track, audioUrl: `https://example.com/audio/${track.id}.mp3` };
      });
      const deps = buildDeps({ likedSongs, music });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("search");
      expect(result.track.title).toBe("Search Result");
    });

    it("is 'queue' when favorites and search return no candidates", async () => {
      const likedSongs = createMockLikedSongsRepo([]);
      const queueTrack = makeTrack("queue-001", "Queue Track");
      const music = createFakeMusicAdapter();
      music.search = vi.fn().mockResolvedValue([]);
      music.resolve = vi.fn().mockImplementation(async (track: Track) => ({
        ...track,
        audioUrl: `https://example.com/audio/${track.id}.mp3`
      }));
      const state = createPlaybackState([queueTrack]);
      const deps = buildDeps({ likedSongs, music, state });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("queue");
      expect(result.track.title).toBe("Queue Track");
    });

    it("throws when favorites, search, and queue are all empty", async () => {
      const likedSongs = createMockLikedSongsRepo([]);
      const music = createFakeMusicAdapter();
      music.search = vi.fn().mockResolvedValue([]);
      music.resolve = vi.fn().mockRejectedValue(new Error("should not be called"));
      const deps = buildDeps({ likedSongs, music });

      await expect(resolveNextTrackAndDecision(deps)).rejects.toThrow("No track available");
    });
  });

  describe("favorites deduplication against recent and current tracks", () => {
    it("skips a favorite track that is in recentlySelectedTrackIds", async () => {
      const favTrack1 = makeTrack("fav-001", "Recently Played Favorite");
      const favTrack2 = makeTrack("fav-002", "Available Favorite");
      const likedSongs = createMockLikedSongsRepo([favTrack1, favTrack2]);
      const music = createFakeMusicAdapter();
      const state = createPlaybackState([]);
      // Simulate favTrack1 was recently selected
      state.rememberSelectedTrack(favTrack1);
      const deps = buildDeps({ likedSongs, music, state });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("favorites");
      expect(result.track.title).toBe("Available Favorite");
    });

    it("skips a favorite track that is currently playing", async () => {
      const favTrack1 = makeTrack("fav-001", "Current Track");
      const favTrack2 = makeTrack("fav-002", "Next Favorite");
      const likedSongs = createMockLikedSongsRepo([favTrack1, favTrack2]);
      const music = createFakeMusicAdapter();
      const state = createPlaybackState([]);
      state.setTrack(favTrack1);
      const deps = buildDeps({ likedSongs, music, state });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("favorites");
      expect(result.track.title).toBe("Next Favorite");
    });

    it("does not accept an LLM-picked favorite when it was recently played", async () => {
      const favTrack1 = makeTrack("fav-001", "Recently Picked Favorite");
      const favTrack2 = makeTrack("fav-002", "Available Favorite");
      const likedSongs = createMockLikedSongsRepo([favTrack1, favTrack2]);
      const music = createFakeMusicAdapter();
      const state = createPlaybackState([]);
      state.rememberSelectedTrack(favTrack1);
      const llm = {
        compute: vi.fn()
          .mockResolvedValueOnce({
            say: "Try the recent one again.",
            play: { trackId: "fav-001", query: "warm morning indie", reason: "draft" },
            segue: "draft",
            reason: "draft"
          })
          .mockResolvedValueOnce({
            say: "Now playing Available Favorite by Test Artist.",
            play: { trackId: "fav-002", reason: "grounded" },
            segue: "grounded",
            reason: "grounded"
          })
      };
      const deps = buildDeps({ likedSongs, music, state, llm: llm as EpisodeRunnerDeps["llm"] });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("favorites");
      expect(result.rerankSource).toBe("fallback");
      expect(result.track.id).toBe("fav-002");
      expect(music.resolve).not.toHaveBeenCalledWith(favTrack1);
    });

    it("falls through to search when all favorites were recently played", async () => {
      const favTrack1 = makeTrack("fav-001", "Recent Favorite One");
      const favTrack2 = makeTrack("fav-002", "Recent Favorite Two");
      const searchTrack = makeTrack("search-001", "Fresh Search Result");
      const likedSongs = createMockLikedSongsRepo([favTrack1, favTrack2]);
      const music = createFakeMusicAdapter();
      music.search = vi.fn().mockResolvedValue([searchTrack]);
      const state = createPlaybackState([]);
      state.rememberSelectedTrack(favTrack1);
      state.rememberSelectedTrack(favTrack2);
      const deps = buildDeps({ likedSongs, music, state });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.candidateSource).toBe("search");
      expect(result.track.id).toBe("search-001");
    });
  });

  describe("DJ decision toolResults include favorites info", () => {
    it("includes favorites.available and favorites.candidateSource in toolResults", async () => {
      const favTrack = makeTrack("fav-001", "My Favorite");
      const likedSongs = createMockLikedSongsRepo([favTrack]);
      const music = createFakeMusicAdapter();
      const deps = buildDeps({ likedSongs, music });

      await resolveNextTrackAndDecision(deps);

      // The second computeDjDecision call includes toolResults
      const llm = deps.llm as ReturnType<typeof createFakeLlmAdapter>;
      const lastCall = llm.compute.mock.calls.at(-1);
      // toolResults are embedded in the "用户输入和工具结果" fragment content
      const requestFragment = lastCall?.[0]?.find((m: { label: string }) => m.label === "用户输入和工具结果");
      const content: string = requestFragment?.content ?? "";
      expect(content).toContain("favorites.available:");
      expect(content).toContain("candidates.source:");
    });

    it("falls back to selected-track copy when LLM narration mentions a different song", async () => {
      const favTrack = makeTrack("fav-001", "Actual Favorite", "Favorite Artist");
      const likedSongs = createMockLikedSongsRepo([favTrack]);
      const music = createFakeMusicAdapter();
      const llm = {
        compute: vi.fn()
          .mockResolvedValueOnce({
            say: "Draft query.",
            play: { query: "warm morning indie", reason: "draft" },
            segue: "draft",
            reason: "draft"
          })
          .mockResolvedValueOnce({
            say: "来听这首 Deep Focus Electronics。",
            play: { query: "Deep Focus Electronics", reason: "wrong track" },
            segue: "wrong segue",
            reason: "wrong track"
          })
      };
      const deps = buildDeps({ likedSongs, music, llm: llm as EpisodeRunnerDeps["llm"] });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.track.title).toBe("Actual Favorite");
      expect(result.decision.say).toContain("Actual Favorite");
      expect(result.decision.say).toContain("Favorite Artist");
      expect(result.decision.say).not.toContain("Deep Focus Electronics");
      expect(result.decision.play.trackId).toBe("fav-001");
    });
  });

  describe("track always gets audioUrl via music.resolve", () => {
    it("resolves favorite track through music adapter", async () => {
      const favTrack = makeTrack("fav-001", "Resolved Favorite");
      const likedSongs = createMockLikedSongsRepo([favTrack]);
      const music = createFakeMusicAdapter();
      const deps = buildDeps({ likedSongs, music });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.track.audioUrl).toBeDefined();
      expect(result.track.audioUrl).toContain("example.com");
      expect(music.resolve).toHaveBeenCalledWith(favTrack);
    });

    it("resolves search track through music adapter when no favorites", async () => {
      const likedSongs = createMockLikedSongsRepo([]);
      const music = createFakeMusicAdapter();
      const deps = buildDeps({ likedSongs, music });

      const result = await resolveNextTrackAndDecision(deps);

      expect(result.track.audioUrl).toBeDefined();
      expect(music.resolve).toHaveBeenCalled();
    });
  });
});
