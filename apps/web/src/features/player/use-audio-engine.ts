"use client";

import { useCallback, useRef } from "react";
import { computeFadedVolume } from "./player-view-model";

export type AudioEngine = {
  musicRef: React.RefObject<HTMLAudioElement | null>;
  speechRef: React.RefObject<HTMLAudioElement | null>;
  fadeVolume(audio: HTMLAudioElement, targetVolume: number, durationMs: number): void;
  restoreMusicVolume(): void;
  isDucking(): boolean;
  setDucking(value: boolean): void;
};

export function useAudioEngine(): AudioEngine {
  const musicRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<HTMLAudioElement>(null);
  const isDuckingRef = useRef(false);

  const fadeVolume = useCallback((audio: HTMLAudioElement, targetVolume: number, durationMs: number) => {
    const startVolume = audio.volume;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      audio.volume = computeFadedVolume(startVolume, targetVolume, durationMs, elapsed);
      if (elapsed < durationMs) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, []);

  const restoreMusicVolume = useCallback(() => {
    const musicAudio = musicRef.current;
    if (musicAudio && isDuckingRef.current) {
      isDuckingRef.current = false;
      fadeVolume(musicAudio, 1.0, 300);
    }
  }, [fadeVolume]);

  return {
    musicRef,
    speechRef,
    fadeVolume,
    restoreMusicVolume,
    isDucking: () => isDuckingRef.current,
    setDucking: (value: boolean) => { isDuckingRef.current = value; }
  };
}
