'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAvatarUrl, getWeatherNow, uploadAvatar, type AvatarKind } from '../../lib/api-client';
import type { WeatherNowResponse } from '@fakeradio/shared';

// ─────────────────────────────────────────────────────────────
// RoundAvatar — 可上传的圆形头像（dj / user 两种）
// 服务端存 user/avatars/{kind}.{ext}；没上传过时回退到文字占位。
// 上传成功后广播 window 事件，TopBar / 聊天气泡 / 面板同步刷新。
// ─────────────────────────────────────────────────────────────

const AVATAR_EVENT = 'fakeradio:avatar-updated';
const WEATHER_EVENT = 'fakeradio:weather-updated';

/** 头像 URL + 版本号。监听上传事件自动刷新缓存。 */
export function useAvatar(kind: AvatarKind): { src: string; failed: boolean; onError: () => void } {
  const [version, setVersion] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ kind: AvatarKind }>).detail?.kind !== kind) return;
      setFailed(false);
      setVersion(Date.now());
    };
    window.addEventListener(AVATAR_EVENT, handler);
    return () => window.removeEventListener(AVATAR_EVENT, handler);
  }, [kind]);

  return { src: buildAvatarUrl(kind, version), failed, onError: useCallback(() => setFailed(true), []) };
}

export function notifyAvatarUpdated(kind: AvatarKind) {
  window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { kind } }));
}

export function notifyWeatherUpdated() {
  window.dispatchEvent(new CustomEvent(WEATHER_EVENT));
}

/** TopBar 天气行数据：挂载时拉取，每 15 分钟刷新，城市修改后立即刷新。 */
export function useWeatherNow(): WeatherNowResponse | null {
  const [weather, setWeather] = useState<WeatherNowResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getWeatherNow()
        .then((data) => { if (alive) setWeather(data); })
        .catch(() => { /* 保留上一次数据或 null,TopBar 显示回退文案 */ });
    };
    load();
    const timer = setInterval(load, 15 * 60 * 1000);
    window.addEventListener(WEATHER_EVENT, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(WEATHER_EVENT, load);
    };
  }, []);

  return weather;
}

export function RoundAvatar({
  kind,
  size,
  fallback,
  fallbackStyle,
  border = '1px solid var(--line)',
  onClick,
  ariaLabel,
}: {
  kind: AvatarKind;
  size: number;
  /** 没有上传头像时显示的占位内容（如 "FR" / "AI"） */
  fallback: React.ReactNode;
  fallbackStyle?: React.CSSProperties;
  border?: string;
  onClick?: (() => void) | undefined;
  ariaLabel?: string;
}) {
  const avatar = useAvatar(kind);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 404 的 error 事件可能在 React 挂载 onError 监听之前就已触发(水合时序),
  // 挂载后补查一次:加载完成但没有像素 = 失败,切回文字占位。
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      avatar.onError();
    }
    // avatar.onError 是 useCallback 稳定引用;src 变化(重新上传)时重查
  }, [avatar.src, avatar.onError, avatar]);

  const common: React.CSSProperties = {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: '50%',
    border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: 'none',
    padding: 0,
    color: 'var(--ink)',
    fontFamily: 'inherit',
    cursor: onClick ? 'pointer' : 'default',
    ...fallbackStyle,
  };

  const inner = avatar.failed ? (
    fallback
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={avatar.src}
      alt=""
      onError={avatar.onError}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );

  if (onClick) {
    return (
      <button aria-label={ariaLabel} onClick={onClick} style={common}>
        {inner}
      </button>
    );
  }
  return <span aria-label={ariaLabel} style={common}>{inner}</span>;
}

/** 选择本地图片 → canvas 压缩到 256px → 上传 → 广播刷新事件 */
export async function pickAndUploadAvatar(kind: AvatarKind): Promise<void> {
  const file = await new Promise<File | null>((resolvePick) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => resolvePick(input.files?.[0] ?? null);
    // 用户取消选择时 change 不触发,这里不做超时处理——Promise 悬空随页面回收
    input.click();
  });
  if (!file) return;

  const dataUrl = await downscaleToDataUrl(file, 256);
  await uploadAvatar(kind, dataUrl);
  notifyAvatarUpdated(kind);
}

async function downscaleToDataUrl(file: File, maxSize: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // PNG 保透明,其余走 JPEG 压缩
  return file.type === 'image/png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.86);
}
