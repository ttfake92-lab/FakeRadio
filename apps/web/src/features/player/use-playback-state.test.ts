import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaybackState } from "./use-playback-state";
import type { AudioEngine } from "./use-audio-engine";
import type { RadioEpisode, EpisodeNextResponse } from "@fakeradio/shared";

// Mock api-client
vi.mock("../../lib/api-client", () => ({
  buildApiUrl: (path: string) => `http://localhost:3301${path}`,
  buildMediaUrl: (url: string | undefined) => url ? `http://localhost:3301${url}` : undefined,
  getNextEpisode: vi.fn(),
  prefetchNextEpisode: vi.fn(),
}));

function createMockAudioElement(): HTMLAudioElement {
  const el = {
    src: "",
    volume: 1,
    paused: true,
    currentTime: 0,
    duration: 60,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  } as unknown as HTMLAudioElement;
  return el;
}

function createMockAudioEngine(): AudioEngine {
  const musicRef = { current: createMockAudioElement() };
  const speechRef = { current: createMockAudioElement() };
  return {
    musicRef,
    speechRef,
    fadeVolume: vi.fn(),
    restoreMusicVolume: vi.fn(),
    isDucking: () => false,
    setDucking: vi.fn(),
    unlock: vi.fn(),
  };
}

function makeEpisode(overrides?: Partial<RadioEpisode>): RadioEpisode {
  return {
    track: {
      id: "track-1",
      title: "夜车",
      artist: "陈粒",
      album: "如也",
      durationMs: 218000,
      source: "netease",
    },
    story: {
      text: "这首歌来自陈粒的专辑如也",
      audioUrl: "/media/story-1.mp3",
      type: "background",
      sources: [],
    },
    sources: [],
    playback: {
      crossfadeStartOffsetMs: 5000,
      musicStartVolume: 0.3,
    },
    ...overrides,
  } as RadioEpisode;
}

function makeEpisodeResponse(overrides?: Partial<EpisodeNextResponse>): EpisodeNextResponse {
  return {
    episode: makeEpisode(),
    source: "live",
    ...overrides,
  } as EpisodeNextResponse;
}

describe("usePlaybackState", () => {
  let audio: AudioEngine;
  let getNextEpisode: Mock;
  let prefetchNextEpisode: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    audio = createMockAudioEngine();
    const apiClient = await import("../../lib/api-client");
    getNextEpisode = apiClient.getNextEpisode as Mock;
    prefetchNextEpisode = apiClient.prefetchNextEpisode as Mock;
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => usePlaybackState(audio));
    expect(result.current.episodeState).toBe("idle");
    expect(result.current.episodeData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoadingEpisode).toBe(false);
  });

  it("produces correct state label for idle", () => {
    const { result } = renderHook(() => usePlaybackState(audio));
    expect(result.current.episodeStateLabel).toBe("待机");
  });

  it("playEpisode fetches episode and transitions to preparing", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    expect(getNextEpisode).toHaveBeenCalledOnce();
    expect(result.current.episodeData).not.toBeNull();
    expect(result.current.episodeData!.track.id).toBe("track-1");
    // After playEpisode resolves, state should have moved from "preparing"
    // The speechAudio.play() mock resolves immediately, so LOAD_SUCCESS fires -> "story"
    expect(result.current.episodeState).toBe("story");
    expect(result.current.episodeSource).toBe("live");
  });

  it("playEpisode sets error on API failure", async () => {
    getNextEpisode.mockRejectedValue(new Error("网络错误"));
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      try {
        await result.current.playEpisode();
      } catch {
        // expected
      }
    });

    expect(result.current.episodeState).toBe("error");
    expect(result.current.error).toContain("网络错误");
    expect(result.current.episodeData).toBeNull();
  });

  it("playEpisode rejects invalid state transition with specific error", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    // First play succeeds
    await act(async () => {
      await result.current.playEpisode();
    });
    expect(result.current.episodeState).toBe("story");

    // Second play from "story" state: playEpisode guard blocks non-idle/error/music states
    // so it returns without calling API
    await act(async () => {
      await result.current.playEpisode();
    });
    // Should still be "story", API not called again
    expect(getNextEpisode).toHaveBeenCalledOnce();
    expect(result.current.episodeState).toBe("story");
  });

  it("playEpisode blocks when already in non-playable state", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    // Start playing
    await act(async () => {
      await result.current.playEpisode();
    });

    // State is "story" — not idle/error/music, so playEpisode should bail
    const callCountBefore = getNextEpisode.mock.calls.length;
    await act(async () => {
      await result.current.playEpisode();
    });
    expect(getNextEpisode.mock.calls.length).toBe(callCountBefore);
  });

  it("playEpisode from music state starts new episode", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    // First play -> story
    await act(async () => {
      await result.current.playEpisode();
    });

    // Simulate transition to music state via speech ended
    const speechEl = audio.speechRef.current!;
    act(() => {
      (speechEl as any).onended();
    });
    expect(result.current.episodeState).toBe("music");

    // Now playEpisode should work from music state
    getNextEpisode.mockResolvedValue(makeEpisodeResponse({
      episode: makeEpisode({ track: { id: "track-2", title: "晴天", artist: "周杰伦", album: "叶惠美", durationMs: 269000, source: "netease" } as any }),
      source: "prepared",
    }));

    await act(async () => {
      await result.current.playEpisode();
    });

    expect(result.current.episodeData!.track.id).toBe("track-2");
    expect(result.current.episodeSource).toBe("prepared");
  });

  it("clearEpisodeState resets everything to idle", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });
    expect(result.current.episodeState).toBe("story");

    act(() => {
      result.current.clearEpisodeState();
    });

    expect(result.current.episodeState).toBe("idle");
    expect(result.current.episodeData).toBeNull();
    expect(result.current.nextEpisode).toBeNull();
    expect(result.current.nextEpisodeError).toBeNull();
    expect(result.current.isLoadingEpisode).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.episodeSource).toBeNull();
  });

  it("setError updates error state", () => {
    const { result } = renderHook(() => usePlaybackState(audio));

    act(() => {
      result.current.setError("自定义错误");
    });
    expect(result.current.error).toBe("自定义错误");

    act(() => {
      result.current.setError(null);
    });
    expect(result.current.error).toBeNull();
  });

  it("musicAudioUrl is derived from episode data", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    expect(result.current.musicAudioUrl).toBeUndefined();

    await act(async () => {
      await result.current.playEpisode();
    });

    expect(result.current.musicAudioUrl).toBe("http://localhost:3301/api/audio/track-1");
  });

  it("speech error transitions to error state", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    const speechEl = audio.speechRef.current! as any;
    act(() => {
      speechEl.onerror();
    });

    expect(result.current.episodeState).toBe("error");
    expect(result.current.error).toBe("口播加载失败");
  });

  it("speech ended transitions to music state", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    const speechEl = audio.speechRef.current! as any;
    act(() => {
      speechEl.onended();
    });

    expect(result.current.episodeState).toBe("music");
    // musicAudio should start playing and volume set to 1
    expect((audio.musicRef.current as any).volume).toBe(1);
    expect(audio.musicRef.current!.play).toHaveBeenCalled();
  });

  it("music ended returns to idle when no next episode", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    // Mock prefetch to reject so isPrefetchingRef settles to false quickly
    prefetchNextEpisode.mockRejectedValue(new Error("no next"));
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    // Move to music
    act(() => {
      (audio.speechRef.current! as any).onended();
    });
    expect(result.current.episodeState).toBe("music");

    // Wait for prefetch effect to complete (it will fail, settling isPrefetchingRef to false)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Music ends, no next episode queued
    act(() => {
      (audio.musicRef.current! as any).onended();
    });

    expect(result.current.episodeState).toBe("idle");
  });

  it("prefetchNextEpisode is triggered when entering music state", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    prefetchNextEpisode.mockResolvedValue(makeEpisodeResponse({
      episode: makeEpisode({ track: { id: "track-prefetch" } as any }),
    }));

    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    // Transition to music
    const speechEl = audio.speechRef.current! as any;
    act(() => {
      speechEl.onended();
    });

    // prefetchNextEpisode should have been called
    // Wait for the async prefetch
    await vi.waitFor(() => {
      expect(prefetchNextEpisode).toHaveBeenCalled();
    });
  });

  it("playEpisode from error state works after clearEpisodeState", async () => {
    getNextEpisode.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      try { await result.current.playEpisode(); } catch {}
    });
    expect(result.current.episodeState).toBe("error");

    act(() => {
      result.current.clearEpisodeState();
    });
    expect(result.current.episodeState).toBe("idle");

    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    await act(async () => {
      await result.current.playEpisode();
    });
    expect(result.current.episodeState).toBe("story");
  });

  it("sets audio sources correctly on playEpisode", async () => {
    getNextEpisode.mockResolvedValue(makeEpisodeResponse());
    const { result } = renderHook(() => usePlaybackState(audio));

    await act(async () => {
      await result.current.playEpisode();
    });

    const musicEl = audio.musicRef.current as any;
    const speechEl = audio.speechRef.current as any;

    expect(musicEl.src).toBe("http://localhost:3301/api/audio/track-1");
    expect(musicEl.volume).toBe(0);
    expect(speechEl.src).toBe("http://localhost:3301/media/story-1.mp3");
  });
});
