"use client";

import { useCallback, useEffect, useRef } from "react";
import { computeFadedVolume } from "./player-view-model";

export type AudioEngine = {
  musicRef: React.RefObject<HTMLAudioElement | null>;
  speechRef: React.RefObject<HTMLAudioElement | null>;
  fadeVolume(audio: HTMLAudioElement, targetVolume: number, durationMs: number): void;
  restoreMusicVolume(): void;
  isDucking(): boolean;
  setDucking(value: boolean): void;
  /** 在用户手势同步栈内调用，解锁 iOS 自动播放限制 */
  unlock(): void;
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

  // iOS/iPadOS 自动播放策略：play() 必须在用户手势同步栈内。
  // 本电台播放链路在点击后会 await 网络请求再 play()，手势上下文已失效。
  // 在点击的同步栈内先 play()+pause() 一次，给元素打上"已激活"标记，
  // 后续异步 play() 即可放行。无 src 时 play() 会 reject，忽略即可。
  const unlock = useCallback(() => {
    for (const ref of [musicRef, speechRef]) {
      const el = ref.current;
      if (!el) continue;
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          // 只有当 src 仍为空时才 pause。若此时 src 已非空，说明
          // playEpisodeData 已经设入新 src 并接管了该元素——这次 resolve
          // 是新 src 触发的，pause 会把刚启动的播放打断（音乐/口播无声卡住）。
          if (!el.src) {
            el.pause();
          }
          el.muted = false;
        }).catch(() => {
          el.muted = false;
        });
      }
    }
  }, []);

  // iOS/iPadOS：页面切后台再回前台时，AudioContext 挂起恢复可能导致
  // 被 createMediaElementSource 路由的音频元素 currentTime 被重置为 0。
  // 隐藏前记录位置，恢复时若检测到被重置（当时非 0 却回到 0）则还原。
  useEffect(() => {
    if (typeof document === "undefined") return;
    let hiddenAt: number | null = null;
    const onHide = () => {
      const audio = musicRef.current;
      if (audio && !audio.paused) hiddenAt = audio.currentTime;
    };
    const onShow = () => {
      if (hiddenAt === null) return;
      const audio = musicRef.current;
      if (audio && hiddenAt > 1 && audio.currentTime < 0.5 && !audio.paused) {
        try { audio.currentTime = hiddenAt; } catch { /* seek 失败忽略 */ }
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHide();
      else onShow();
    });
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  return {
    musicRef,
    speechRef,
    fadeVolume,
    restoreMusicVolume,
    isDucking: () => isDuckingRef.current,
    setDucking: (value: boolean) => { isDuckingRef.current = value; },
    unlock
  };
}
