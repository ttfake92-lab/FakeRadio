"use client";

import { useRef, useState, useCallback } from "react";
import { buildApiUrl } from "../../lib/api-client";

export type ChatSSEOptions = {
  onChunk(text: string): void;
  onDone(data: { text: string; action?: { type: string; trackId?: string; title?: string; artist?: string; briefId?: string } | null }): void;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  fav?: boolean;
  trackChip?: { title: string; artist: string };
};

export function useChatSSE() {
  const [isConnected, setIsConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string, opts: ChatSSEOptions) => {
    // Cancel any existing stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    abortRef.current = new AbortController();
    setIsConnected(true);

    try {
      const response = await fetch(buildApiUrl("/api/chat/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        opts.onDone({ text: "信号断了。再说一次？" });
        setIsConnected(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        opts.onDone({ text: "信号断了。再说一次？" });
        setIsConnected(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      let dataBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            // End of event
            if ((eventType === "chunk" || eventType === "") && dataBuffer) {
              opts.onChunk(dataBuffer);
            } else if (eventType === "done" && dataBuffer) {
              try {
                const parsed = JSON.parse(dataBuffer);
                opts.onDone(parsed);
              } catch {
                opts.onDone({ text: dataBuffer });
              }
            }
            eventType = "";
            dataBuffer = "";
          } else if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataBuffer = line.slice(6).trim();
          }
        }
      }

      // Process remaining buffer
      if (dataBuffer) {
        if ((eventType === "chunk" || eventType === "") && dataBuffer) {
          opts.onChunk(dataBuffer);
        } else if (eventType === "done") {
          try {
            opts.onDone(JSON.parse(dataBuffer));
          } catch {
            opts.onDone({ text: dataBuffer });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        opts.onDone({ text: "信号断了。再说一次？" });
      }
    } finally {
      setIsConnected(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { sendMessage, cancel, isConnected };
}
