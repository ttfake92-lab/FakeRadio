import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorialRadio } from "./editorial-radio";
import { getNextEpisode } from "../../lib/api-client";

const chatSseMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock("../player/use-stream-connection", () => ({
  useStreamConnection: () => ({
    streamStatus: { label: "已连接", detail: "stream ready" },
  }),
}));

vi.mock("../player/use-chat-sse", () => ({
  useChatSSE: () => ({
    sendMessage: chatSseMocks.sendMessage,
    cancel: vi.fn(),
    isConnected: false,
  }),
}));

vi.mock("../../lib/api-client", () => ({
  buildApiUrl: (path: string) => `http://localhost:3301${path}`,
  buildMediaUrl: (url?: string) => (url ? `http://localhost:3301${url}` : undefined),
  getNow: vi.fn().mockResolvedValue({
    playback: "idle",
    track: null,
    dj: { say: "FakeRadio 准备好了。" },
    queue: [],
    updatedAt: new Date("2026-06-19T00:00:00.000Z").toISOString(),
  }),
  getFavorites: vi.fn().mockResolvedValue({ favorites: [] }),
  getBriefs: vi.fn().mockResolvedValue({ briefs: [] }),
  getShowPlans: vi.fn().mockResolvedValue({ plans: [] }),
  getShowJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  getShowProjects: vi.fn().mockResolvedValue({ projects: [] }),
  getNeteaseLoginStatus: vi.fn().mockResolvedValue({
    status: "logged-out",
    loggedIn: false,
    cookieStored: false,
    message: "未登录",
  }),
  getTaste: vi.fn().mockResolvedValue({
    taste: "",
    routines: "",
    playlists: [],
    moodRules: "",
  }),
  getTodayPlan: vi.fn().mockResolvedValue({ date: "2026-06-19", blocks: [] }),
  getPrewarmStatus: vi.fn().mockResolvedValue({ enabled: false, targetDate: "2026-06-19", blocks: [] }),
  getNextEpisode: vi.fn(),
  prefetchNextEpisode: vi.fn(),
  reportEpisodePlaying: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  createNeteaseQrLogin: vi.fn(),
  checkNeteaseQrLogin: vi.fn(),
  submitNeteaseCookie: vi.fn(),
  generateNow: vi.fn(),
  exportProject: vi.fn(),
  getProjectExportFiles: vi.fn(),
  downloadProjectFile: vi.fn(),
  exportTodayShow: vi.fn(),
  getExportTodayStatus: vi.fn(),
}));

function installMatchMedia(width: number) {
  let currentWidth = width;
  const lists = new Map<string, {
    media: string;
    listeners: Set<(event: MediaQueryListEvent) => void>;
    legacyListeners: Set<(event: MediaQueryListEvent) => void>;
    matches: boolean;
  }>();
  const getMatches = (query: string) =>
    (query.includes("max-width: 1023px") && currentWidth < 1024) ||
    (query.includes("min-width: 640px") && query.includes("max-width: 1023px") && currentWidth >= 640 && currentWidth < 1024) ||
    (query.includes("min-width: 1024px") && currentWidth >= 1024) ||
    (query.includes("prefers-color-scheme") && false);

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: currentWidth,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const existing = lists.get(query);
    if (existing) {
      return existing;
    }

    const list = {
      media: query,
      listeners: new Set<(event: MediaQueryListEvent) => void>(),
      legacyListeners: new Set<(event: MediaQueryListEvent) => void>(),
      get matches() {
        return getMatches(query);
      },
      onchange: null,
      addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") list.listeners.add(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") list.listeners.delete(listener);
      }),
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        list.legacyListeners.add(listener);
      }),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        list.legacyListeners.delete(listener);
      }),
      dispatchEvent: vi.fn(),
    };
    lists.set(query, list);
    return list;
  });

  return {
    setWidth(nextWidth: number) {
      currentWidth = nextWidth;
      window.innerWidth = nextWidth;
      for (const list of lists.values()) {
        const event = { matches: list.matches, media: list.media } as MediaQueryListEvent;
        list.listeners.forEach((listener) => listener(event));
        list.legacyListeners.forEach((listener) => listener(event));
      }
    },
  };
}

describe("EditorialRadio mobile runtime wiring", () => {
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    vi.clearAllMocks();
    chatSseMocks.sendMessage.mockReset();
    installMatchMedia(375);
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: originalAudioContext,
    });
  });

  it("mounts both music and speech audio elements in the mobile layout", async () => {
    const { container } = render(<EditorialRadio />);

    expect(await screen.findByText(/CH · EDITORIAL/)).toBeInTheDocument();
    expect(container.querySelectorAll("audio")).toHaveLength(2);
  });

  it("uses the original separate DJ subtitle and chat drawer layout", async () => {
    render(<EditorialRadio />);

    expect(await screen.findByText("和 DJ 聊聊")).toBeInTheDocument();
    expect(screen.getByText("DJ · 正在说话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开聊天" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收起聊天" })).not.toBeInTheDocument();
  });

  it("renders long mobile track titles without breaking playback controls", async () => {
    const api = await import("../../lib/api-client");
    vi.mocked(api.getNow).mockResolvedValueOnce({
      playback: "idle",
      track: {
        id: "track-long-title",
        title: "Bigcitydreams",
        artist: "Never Shout Never",
        source: "netease",
      },
      dj: { say: "FakeRadio 准备好了。" },
      queue: [],
      updatedAt: new Date("2026-06-19T00:00:00.000Z").toISOString(),
    });

    render(<EditorialRadio />);

    expect(await screen.findByText("Bigcitydreams")).toBeInTheDocument();
    expect(screen.getByText("Never Shout Never")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PLAY" })).toBeInTheDocument();
  });

  it("keeps the mobile play button wired to episode playback", async () => {
    vi.mocked(getNextEpisode).mockResolvedValue({
      source: "live",
      episode: {
        track: {
          id: "track-1",
          title: "Bloom",
          artist: "LANY",
          source: "netease",
        },
        story: {
          text: "有些情绪要等它自己开。",
          audioUrl: "/api/tts/story.mp3",
          type: "mood-reading",
        },
        sources: [],
        playback: {
          musicStartVolume: 0.12,
          crossfadeStartOffsetMs: 800,
        },
      },
    });

    render(<EditorialRadio />);

    fireEvent.click(await screen.findByRole("button", { name: "PLAY" }));

    await waitFor(() => {
      expect(getNextEpisode).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the same audio elements mounted while switching between mobile and desktop", async () => {
    const viewport = installMatchMedia(375);
    const { container } = render(<EditorialRadio />);

    expect(await screen.findByText(/CH · EDITORIAL/)).toBeInTheDocument();
    const mobileAudio = Array.from(container.querySelectorAll("audio"));
    expect(mobileAudio).toHaveLength(2);

    act(() => viewport.setWidth(1280));

    await waitFor(() => {
      expect(screen.getByText("正在播放")).toBeInTheDocument();
    });
    const desktopAudio = Array.from(container.querySelectorAll("audio"));
    expect(desktopAudio).toHaveLength(2);
    expect(desktopAudio[0]).toBe(mobileAudio[0]);
    expect(desktopAudio[1]).toBe(mobileAudio[1]);
  });

  it("mirrors the latest DJ chat reply into the now-speaking subtitle", async () => {
    render(<EditorialRadio />);

    const subtitleCard = (await screen.findByText("DJ · 正在说话")).parentElement;
    expect(subtitleCard).not.toBeNull();

    const input = screen.getByPlaceholderText("说点什么…");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "现在这首歌是什么？" } });
    fireEvent.submit(input.closest("form")!);

    expect(chatSseMocks.sendMessage).toHaveBeenCalledTimes(1);
    const options = chatSseMocks.sendMessage.mock.calls[0]?.[1];
    act(() => {
      options.onChunk("现在播的是 Bloom");
      options.onDone({ text: "现在播的是 Bloom，来自 LANY。" });
    });

    expect(within(subtitleCard!).getByText(/现在播的是 Bloom，来自 LANY。/)).toBeInTheDocument();
    expect(screen.getAllByText(/现在播的是 Bloom，来自 LANY。/).length).toBeGreaterThanOrEqual(2);
  });

  it("wakes the real audio visualizer when the music element resumes playback", async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    class FakeAudioContext {
      destination = {};
      createMediaElementSource = vi.fn(() => ({ connect: vi.fn() }));
      createAnalyser = vi.fn(() => ({
        fftSize: 0,
        minDecibels: 0,
        maxDecibels: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 128,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn(),
      }));
      resume = resume;
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });

    const { container } = render(<EditorialRadio />);

    expect(await screen.findByText(/CH · EDITORIAL/)).toBeInTheDocument();
    const musicAudio = container.querySelector("audio");
    expect(musicAudio).not.toBeNull();

    fireEvent.play(musicAudio!);

    expect(resume).toHaveBeenCalled();
  });
});
