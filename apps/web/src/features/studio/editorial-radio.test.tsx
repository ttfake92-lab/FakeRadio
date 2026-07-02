import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function installMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("EditorialRadio phone-frame runtime wiring", () => {
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    vi.clearAllMocks();
    chatSseMocks.sendMessage.mockReset();
    localStorage.clear();
    installMatchMedia();
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

  it("mounts both music and speech audio elements with the new header", async () => {
    const { container } = render(<EditorialRadio />);

    expect(await screen.findByText("FakeRadio")).toBeInTheDocument();
    expect(screen.getByText("[ LOCAL RADIO • 88.7 FM ]")).toBeInTheDocument();
    expect(container.querySelectorAll("audio")).toHaveLength(2);
  });

  it("renders track title and artist from now-playing data", async () => {
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
    expect(screen.getByRole("button", { name: "play" })).toBeInTheDocument();
  });

  it("keeps the play button wired to episode playback", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "play" }));

    await waitFor(() => {
      expect(getNextEpisode).toHaveBeenCalledTimes(1);
    });
  });

  it("sends chat via SSE and renders the DJ reply as a chat bubble", async () => {
    render(<EditorialRadio />);

    const input = await screen.findByPlaceholderText("Talk to the radio AI...");
    fireEvent.change(input, { target: { value: "现在这首歌是什么？" } });
    fireEvent.submit(input.closest("form")!);

    expect(chatSseMocks.sendMessage).toHaveBeenCalledTimes(1);
    const options = chatSseMocks.sendMessage.mock.calls[0]?.[1];
    act(() => {
      options.onChunk("现在播的是 Bloom");
      options.onDone({ text: "现在播的是 Bloom，来自 LANY。" });
    });

    expect(screen.getByText(/现在播的是 Bloom，来自 LANY。/)).toBeInTheDocument();
    // 用户消息也进对话流
    expect(screen.getByText("现在这首歌是什么？")).toBeInTheDocument();
  });

  it("switches theme via the DARK / LIGHT segmented control and persists it", async () => {
    render(<EditorialRadio />);

    fireEvent.click(await screen.findByRole("button", { name: "DARK" }));

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
    expect(localStorage.getItem("fakeradio.theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "LIGHT" }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("migrates the legacy graphite theme value to dark", async () => {
    localStorage.setItem("fakeradio.theme", "graphite");

    render(<EditorialRadio />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("expands the queue bar to show the real (empty) queue", async () => {
    render(<EditorialRadio />);

    const queueToggle = await screen.findByRole("button", { name: /QUEUE/ });
    expect(queueToggle).toHaveTextContent("0 TRACKS");

    fireEvent.click(queueToggle);
    expect(screen.getByText(/NO UPCOMING TRACKS/)).toBeInTheDocument();
  });

  it("opens the top-right menu with library / settings / netease entries", async () => {
    render(<EditorialRadio />);

    fireEvent.click(await screen.findByRole("button", { name: "menu" }));

    expect(screen.getByText("节目库")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("网易云登录")).toBeInTheDocument();
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

    expect(await screen.findByText("FakeRadio")).toBeInTheDocument();
    const musicAudio = container.querySelector("audio");
    expect(musicAudio).not.toBeNull();

    fireEvent.play(musicAudio!);

    expect(resume).toHaveBeenCalled();
  });
});
