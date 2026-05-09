"use client";

import type { NowResponse, StreamEvent } from "@fakeradio/shared";
import { StreamEventSchema } from "@fakeradio/shared";
import { useEffect, useState } from "react";
import { buildMediaUrl, buildStreamUrl } from "../../lib/api-client";
import type { AudioEngine } from "./use-audio-engine";

export type StreamStatus = {
  label: string;
  detail: string;
};

export type AgentMessage = {
  role: "agent";
  text: string;
  trackId: string;
};

export type StreamConnection = {
  streamStatus: StreamStatus;
};

export function useStreamConnection(
  audio: AudioEngine,
  onNowPlaying: (now: NowResponse) => void,
  onQueueUpdated: (queue: NowResponse["queue"]) => void,
  onDjSpeech: (dj: NowResponse["dj"]) => void,
  onAgentMessage?: (msg: AgentMessage) => void
): StreamConnection {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({
    label: "连接中",
    detail: "等待本地 stream"
  });

  useEffect(() => {
    const socket = new WebSocket(buildStreamUrl("/stream"));

    socket.addEventListener("open", () => {
      setStreamStatus({ label: "已连接", detail: "stream ready" });
    });

    socket.addEventListener("message", (message) => {
      let event: StreamEvent;
      try {
        event = StreamEventSchema.parse(JSON.parse(String(message.data))) as StreamEvent;
      } catch {
        setStreamStatus({ label: "warn", detail: "收到无法解析的消息" });
        return;
      }

      if (event.type === "now-playing") {
        onNowPlaying(event.payload);
      }

      if (event.type === "queue-updated") {
        onQueueUpdated(event.payload.queue);
      }

      if (event.type === "dj-speech") {
        const musicAudio = audio.musicRef.current;
        const speechAudio = audio.speechRef.current;

        if (speechAudio && event.payload.audioUrl) {
          if (audio.isDucking()) {
            audio.restoreMusicVolume();
          }

          speechAudio.src = buildMediaUrl(event.payload.audioUrl) ?? "";
          speechAudio.onended = () => audio.restoreMusicVolume();
          speechAudio.onerror = () => audio.restoreMusicVolume();

          if (musicAudio && !musicAudio.paused) {
            audio.setDucking(true);
            audio.fadeVolume(musicAudio, 0.2, 300);
          }

          speechAudio.play().catch(() => audio.restoreMusicVolume());
        }

        const dj: NowResponse["dj"] = { say: event.payload.text };
        if (event.payload.audioUrl !== undefined) {
          dj.audioUrl = event.payload.audioUrl;
        }
        onDjSpeech(dj);
      }

      if (event.type === "agent-message" && onAgentMessage) {
        onAgentMessage(event.payload);
      }

      if (event.type === "diagnostic") {
        setStreamStatus({ label: event.payload.level, detail: event.payload.message });
      }
    });

    socket.addEventListener("error", () => {
      setStreamStatus({ label: "异常", detail: "stream error" });
    });

    socket.addEventListener("close", () => {
      setStreamStatus({ label: "已断开", detail: "stream closed" });
    });

    return () => { socket.close(); };
  }, []);

  return { streamStatus };
}
