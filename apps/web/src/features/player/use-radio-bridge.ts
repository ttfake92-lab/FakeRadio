"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { sendChat } from "../../lib/api-client";
import type { ChatMessage } from "./use-chat-sse";
import type { Persona, VisualTrack } from "./skin-config";

export type RadioBridgeParams = {
  persona: Persona;
  track: VisualTrack | null;
  next: VisualTrack | null;
  playing: boolean;
  loading: boolean;
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
  loading: boolean;
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
    loading,
    pos,
    vol,
    liked,
    mood,
    messages: externalMessages,
    input: externalInput,
    busy: externalBusy,
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
  useEffect(() => { setLikedState(liked); }, [liked]);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!track) return;
    const seedKey = `${persona.name}:${track.id}`;
    if (seededFor.current === seedKey) return;
    seededFor.current = seedKey;

    const greetings: Record<string, string> = {
      深夜电台: `夜里好。这首《${track.title}》是 ${track.artist}，先把灯调暗一点。`,
      清晨陪伴: `早。给你放《${track.title}》，慢慢醒。`,
      话痨好友: `嘿，你也在啊。我先放着《${track.title}》，你随便聊。`,
      极简冷淡: `在。播《${track.title}》。`,
    };

    setChatMessages([{
      id: `seed-${track.id}`,
      role: "assistant",
      text: greetings[persona.name] ?? `正在播《${track.title}》。`,
      trackChip: { title: track.title, artist: track.artist },
    }]);
  }, [persona.name, track]);

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

      try {
        const data = await sendChat(userText);
        fullText = data.message;
        setChatMessages((m) =>
          m.map((x) =>
            x.id === aId ? { ...x, text: fullText, streaming: false } : x
          )
        );

        if (data.action?.type === "next-track") {
          onNext();
        } else if (data.action?.type === "add-favorite" && track) {
          onToggleLike();
        }
      } catch {
        setChatMessages((m) =>
          m.map((x) =>
            x.id === aId ? { ...x, text: "信号断了。再说一次？", streaming: false } : x
          )
        );
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, onNext, onToggleLike, track]
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

  if (!track || !next) {
    throw new Error("useRadioBridge requires track and next to be non-null");
  }

  const r: RadioState = {
    track,
    next,
    playing,
    loading,
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
    onChip: ask,
    ask,
    onBubbleAction,
    seedReset: () => {
      seededFor.current = null;
    },
  };

  return { r, chatMessages, chatInput, isBusy, setChatInput };
}
