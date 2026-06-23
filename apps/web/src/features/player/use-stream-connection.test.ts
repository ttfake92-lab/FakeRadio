import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamConnection } from "./use-stream-connection";
import type { AudioEngine } from "./use-audio-engine";

// Mock api-client
vi.mock("../../lib/api-client", () => ({
  buildStreamUrl: (path: string) => `ws://localhost:3301${path}`,
  buildMediaUrl: (url: string | undefined) => url ? `http://localhost:3301${url}` : undefined,
}));

// Track the latest WebSocket instance
let latestSocket: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  private listeners: Record<string, Array<(ev: any) => void>> = {};

  constructor(url: string) {
    this.url = url;
    latestSocket = this;
  }

  addEventListener(type: string, handler: (ev: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type: string, handler: (ev: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(h => h !== handler);
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    (this.listeners["open"] ?? []).forEach(h => h(new Event("open")));
  }

  simulateMessage(data: string) {
    (this.listeners["message"] ?? []).forEach(h =>
      h(new MessageEvent("message", { data }))
    );
  }

  simulateError() {
    (this.listeners["error"] ?? []).forEach(h => h(new Event("error")));
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    (this.listeners["close"] ?? []).forEach(h => h(new CloseEvent("close")));
  }
}

// Replace global WebSocket
const OriginalWebSocket = globalThis.WebSocket;

function createMockAudioEngine(): AudioEngine {
  const musicEl = {
    src: "",
    volume: 1,
    paused: true,
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  } as unknown as HTMLAudioElement;

  const speechEl = {
    src: "",
    volume: 1,
    paused: true,
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  } as unknown as HTMLAudioElement;

  return {
    musicRef: { current: musicEl },
    speechRef: { current: speechEl },
    fadeVolume: vi.fn(),
    restoreMusicVolume: vi.fn(),
    isDucking: () => false,
    setDucking: vi.fn(),
    unlock: vi.fn(),
    getUserVolume: () => 1,
    setUserVolume: vi.fn(),
  };
}

describe("useStreamConnection", () => {
  let audio: AudioEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    latestSocket = null;
    (globalThis as any).WebSocket = MockWebSocket;
    audio = createMockAudioEngine();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = OriginalWebSocket;
  });

  it("starts with connecting status", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );
    expect(result.current.streamStatus).toEqual({
      label: "连接中",
      detail: "等待本地 stream",
    });
  });

  it("creates a WebSocket connection on mount", () => {
    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );
    expect(latestSocket).not.toBeNull();
    expect(latestSocket!.url).toBe("ws://localhost:3301/stream");
  });

  it("updates status to connected on open", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    expect(result.current.streamStatus).toEqual({
      label: "已连接",
      detail: "stream ready",
    });
  });

  it("updates status on error", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateError();
    });

    expect(result.current.streamStatus).toEqual({
      label: "异常",
      detail: "stream error",
    });
  });

  it("updates status on close", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateClose();
    });

    expect(result.current.streamStatus).toEqual({
      label: "已断开",
      detail: "stream closed",
    });
  });

  it("handles unparsable messages gracefully", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage("not json");
    });

    expect(result.current.streamStatus).toEqual({
      label: "warn",
      detail: "收到无法解析的消息",
    });
  });

  it("dispatches now-playing events to callback", () => {
    const onNowPlaying = vi.fn();
    renderHook(() =>
      useStreamConnection(audio, onNowPlaying, vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    const nowPayload = {
      playback: "playing" as const,
      track: { id: "t1", title: "夜车", artist: "陈粒", source: "netease" as const },
      dj: { say: "正在播放" },
      queue: [],
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "now-playing",
        payload: nowPayload,
      }));
    });

    expect(onNowPlaying).toHaveBeenCalledOnce();
    expect(onNowPlaying).toHaveBeenCalledWith(nowPayload);
  });

  it("dispatches queue-updated events to callback", () => {
    const onQueueUpdated = vi.fn();
    renderHook(() =>
      useStreamConnection(audio, vi.fn(), onQueueUpdated, vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    const queue = [
      { id: "t1", title: "夜车", artist: "陈粒", source: "netease" },
      { id: "t2", title: "晴天", artist: "周杰伦", source: "netease" },
    ];

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "queue-updated",
        payload: { queue },
      }));
    });

    expect(onQueueUpdated).toHaveBeenCalledOnce();
    expect(onQueueUpdated).toHaveBeenCalledWith(queue);
  });

  it("dispatches dj-speech events and updates DJ text", () => {
    const onDjSpeech = vi.fn();
    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), onDjSpeech)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "dj-speech",
        payload: { text: "欢迎收听 FakeRadio" },
      }));
    });

    expect(onDjSpeech).toHaveBeenCalledOnce();
    expect(onDjSpeech).toHaveBeenCalledWith({ say: "欢迎收听 FakeRadio" });
  });

  it("plays dj-speech audio when speech element is paused", () => {
    const onDjSpeech = vi.fn();
    const speechEl = audio.speechRef.current as any;
    speechEl.paused = true;

    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), onDjSpeech)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "dj-speech",
        payload: { text: "你好", audioUrl: "/media/dj-hello.mp3" },
      }));
    });

    expect(onDjSpeech).toHaveBeenCalledWith({
      say: "你好",
      audioUrl: "/media/dj-hello.mp3",
    });
    expect(speechEl.src).toBe("http://localhost:3301/media/dj-hello.mp3");
    expect(speechEl.play).toHaveBeenCalled();
  });

  it("does not play dj-speech audio when speech is already active", () => {
    const onDjSpeech = vi.fn();
    const speechEl = audio.speechRef.current as any;
    speechEl.paused = false; // already playing

    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), onDjSpeech)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "dj-speech",
        payload: { text: "你好", audioUrl: "/media/dj-hello.mp3" },
      }));
    });

    // DJ text should still be updated
    expect(onDjSpeech).toHaveBeenCalled();
    // But audio should NOT be set
    expect(speechEl.src).toBe("");
    expect(speechEl.play).not.toHaveBeenCalled();
  });

  it("ignores info-level diagnostic to keep connected status", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "diagnostic",
        payload: {
          level: "info",
          message: "系统正常运行中",
          at: "2026-05-29T00:00:00.000Z",
        },
      }));
    });

    // info 级别不应覆盖已连接状态
    expect(result.current.streamStatus).toEqual({
      label: "已连接",
      detail: "stream ready",
    });
  });

  it("updates status on error-level diagnostic", () => {
    const { result } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "diagnostic",
        payload: {
          level: "error",
          message: "连接异常",
          at: "2026-05-29T00:00:00.000Z",
        },
      }));
    });

    expect(result.current.streamStatus).toEqual({
      label: "error",
      detail: "连接异常",
    });
  });

  it("dispatches agent-message events to optional callback", () => {
    const onAgentMessage = vi.fn();
    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn(), onAgentMessage)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "agent-message",
        payload: { role: "agent", text: "已为你切换到夜间模式" },
      }));
    });

    expect(onAgentMessage).toHaveBeenCalledOnce();
    expect(onAgentMessage).toHaveBeenCalledWith({
      role: "agent",
      text: "已为你切换到夜间模式",
    });
  });

  it("ignores agent-message when no callback provided", () => {
    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    // Should not throw
    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "agent-message",
        payload: { role: "agent", text: "test" },
      }));
    });
  });

  it("closes WebSocket on unmount", () => {
    const { unmount } = renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), vi.fn())
    );

    const socket = latestSocket!;
    const closeSpy = vi.spyOn(socket, "close");

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("handles messages with invalid event type gracefully", () => {
    const onNowPlaying = vi.fn();
    const onQueueUpdated = vi.fn();
    const onDjSpeech = vi.fn();

    renderHook(() =>
      useStreamConnection(audio, onNowPlaying, onQueueUpdated, onDjSpeech)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    // Valid JSON but not matching StreamEventSchema
    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "unknown-event",
        payload: {},
      }));
    });

    // Should not dispatch to any callback
    expect(onNowPlaying).not.toHaveBeenCalled();
    expect(onQueueUpdated).not.toHaveBeenCalled();
    expect(onDjSpeech).not.toHaveBeenCalled();
  });

  it("skips now-playing when episode is active", () => {
    const onNowPlaying = vi.fn();
    renderHook(() =>
      useStreamConnection(audio, onNowPlaying, vi.fn(), vi.fn(), undefined, () => true)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "now-playing",
        payload: {
          playback: "playing",
          track: { id: "t1", title: "夜车", artist: "陈粒", source: "netease" },
          dj: { say: "正在播放" },
          queue: [],
          updatedAt: "2026-05-29T00:00:00.000Z",
        },
      }));
    });

    expect(onNowPlaying).not.toHaveBeenCalled();
  });

  it("skips dj-speech audio playback when episode is active", () => {
    const onDjSpeech = vi.fn();
    const speechEl = audio.speechRef.current as any;
    speechEl.paused = true;

    renderHook(() =>
      useStreamConnection(audio, vi.fn(), vi.fn(), onDjSpeech, undefined, () => true)
    );

    act(() => {
      latestSocket!.simulateOpen();
    });

    act(() => {
      latestSocket!.simulateMessage(JSON.stringify({
        type: "dj-speech",
        payload: { text: "你好", audioUrl: "/media/dj-hello.mp3" },
      }));
    });

    // DJ text should still be updated
    expect(onDjSpeech).toHaveBeenCalled();
    // But audio should NOT be played
    expect(speechEl.src).toBe("");
    expect(speechEl.play).not.toHaveBeenCalled();
  });
});
