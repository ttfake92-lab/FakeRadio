"use client";

import { useCallback, useState, useRef } from "react";
import { useChatSSE, type ChatMessage } from "./use-chat-sse";
import type { Persona, VisualTrack } from "./skin-config";

export type RadioBridgeParams = {
  persona: Persona;
  track: VisualTrack | null;
  next: VisualTrack | null;
  playing: boolean;
  pos: number;
  vol: number;
  liked: Record<string, boolean>;
  mood: string;
  messages: ChatMessage[];
  input: string;
  busy: boolean;
  onSend(text: string): void;
  onChip(prompt: string): void;
  onToggleLike(): void;
  onSeek(pos01: number): void;
  onSkip(direction: number): void;
  onTogglePlay(): void;
  onVolumeChange(vol: number): void;
  onNext(): void;
};

export type RadioState = {
  track: VisualTrack;
  next: VisualTrack;
  playing: boolean;
  pos: number;
  vol: number;
  liked: Record<string, boolean>;
  mood: string;
  setVol(vol: number): void;
  togglePlay(): void;
  skip(direction: number): void;
  seek(pos01: number): void;
  toggleLike(): void;
  messages: ChatMessage[];
  input: string;
  busy: boolean;
  setInput(text: string): void;
  send(override?: string): void;
  onChip(prompt: string): void;
  ask(userText: string, opts?: { silentUser?: boolean }): void;
  onBubbleAction(kind: string, msg: ChatMessage): void;
  seedReset(): void;
};

export function useRadioBridge(params: RadioBridgeParams) {
  const {
    persona,
    track,
    next,
    playing,
    pos,
    vol,
    liked,
    mood,
    messages: externalMessages,
    input: externalInput,
    busy: externalBusy,
    onSend,
    onChip,
    onToggleLike,
    onSeek,
    onSkip,
    onTogglePlay,
    onVolumeChange,
    onNext,
  } = params;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(externalMessages);
  const [chatInput, setChatInput] = useState(externalInput);
  const [isBusy, setIsBusy] = useState(externalBusy);
  const [likedState, setLikedState] = useState(liked);
  const seededFor = useRef<string | null>(null);
  const chatSSE = useChatSSE();

  const ask = useCallback(
    async (userText: string, opts?: { silentUser?: boolean }) => {
      if (isBusy) return;

      const userMsg: ChatMessage = {
        id: "u" + Date.now(),
        role: "user",
        text: userText,
      };
      const aId = "a" + Date.now() + "x";
      const aMsg: ChatMessage = {
        id: aId,
        role: "assistant",
        text: "",
        streaming: true,
      };

      setChatMessages((m) =>
        opts?.silentUser ? [...m, aMsg] : [...m, userMsg, aMsg]
      );
      setIsBusy(true);

      let fullText = "";

      chatSSE.sendMessage(userText, {
        onChunk: (text) => {
          fullText += text;
          setChatMessages((m) =>
            m.map((x) =>
              x.id === aId ? { ...x, text: fullText, streaming: true } : x
            )
          );
        },
        onDone: (data) => {
          fullText = data.text;
          setChatMessages((m) =>
            m.map((x) =>
              x.id === aId ? { ...x, text: data.text, streaming: false } : x
            )
          );
          setIsBusy(false);

          // Execute action if present
          if (data.action?.type === "next-track") {
            onNext();
          } else if (
            data.action?.type === "add-favorite" &&
            track
          ) {
            onToggleLike();
          }
        },
      });
    },
    [isBusy, chatSSE, onNext, onToggleLike, track]
  );

  const send = useCallback(
    (override?: string) => {
      const v = (override !== undefined ? override : chatInput).trim();
      if (!v) return;
      setChatInput("");
      ask(v);
    },
    [chatInput, ask]
  );

  const onBubbleAction = useCallback(
    (kind: string, msg: ChatMessage) => {
      if (kind === "fav") {
        setChatMessages((m) =>
          m.map((x) => (x.id === msg.id ? { ...x, fav: !x.fav } : x))
        );
      } else if (kind === "more") {
        ask("刚才那段再展开点说。", { silentUser: true });
      } else if (kind === "less") {
        ask("太长了,给我一句话总结。", { silentUser: true });
      } else if (kind === "copy") {
        navigator.clipboard?.writeText(msg.text);
      }
    },
    [ask]
  );

  const r: RadioState = {
    track: track!,
    next: next!,
    playing,
    pos,
    vol,
    liked: likedState,
    mood,
    setVol: onVolumeChange,
    togglePlay: onTogglePlay,
    skip: onSkip,
    seek: onSeek,
    toggleLike: () => {
      setLikedState((l) => ({
        ...l,
        [track?.id ?? ""]: !l[track?.id ?? ""],
      }));
      onToggleLike();
    },
    messages: chatMessages,
    input: chatInput,
    busy: isBusy,
    setInput: setChatInput,
    send,
    onChip,
    ask,
    onBubbleAction,
    seedReset: () => {
      seededFor.current = null;
    },
  };

  return { r, chatMessages, chatInput, isBusy, setChatInput, chatSSE };
}
