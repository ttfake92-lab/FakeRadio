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
  trackId?: string | undefined;
};

export type StreamConnection = {
  streamStatus: StreamStatus;
};

export function useStreamConnection(
  audio: AudioEngine,
  onNowPlaying: (now: NowResponse) => void,
  onQueueUpdated: (queue: NowResponse["queue"]) => void,
  onDjSpeech: (dj: NowResponse["dj"]) => void,
  onAgentMessage?: (msg: AgentMessage) => void,
  /** 返回 true 时跳过 now-playing/dj-speech，避免覆盖 episode 播放状态 */
  isEpisodeActive?: () => boolean
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
        // episode 播放中忽略服务端 now-playing，避免卡片显示与实际音频不一致
        if (!isEpisodeActive?.()) {
          onNowPlaying(event.payload);
        }
      }

      if (event.type === "queue-updated") {
        onQueueUpdated(event.payload.queue);
      }

      if (event.type === "dj-speech") {
        const musicAudio = audio.musicRef.current;
        const speechAudio = audio.speechRef.current;

        // Always update DJ text regardless of audio state
        const dj: NowResponse["dj"] = { say: event.payload.text };
        if (event.payload.audioUrl !== undefined) {
          dj.audioUrl = event.payload.audioUrl;
        }
        onDjSpeech(dj);

        // 仅在非 episode 播放、且 speech 元素空闲时才播放后台旁白；
        // episode 播放时 speech 元素被 story 占用，不能抢。
        if (!isEpisodeActive?.() && speechAudio && event.payload.audioUrl && speechAudio.paused) {
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
      }

      if (event.type === "agent-message" && onAgentMessage) {
        onAgentMessage(event.payload);
      }

      if (event.type === "diagnostic") {
        // info 级别不覆盖已连接状态，避免误启轮询
        if (event.payload.level === "error" || event.payload.level === "warn") {
          setStreamStatus({ label: event.payload.level, detail: event.payload.message });
        }
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
