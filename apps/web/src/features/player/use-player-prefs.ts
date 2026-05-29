"use client";

import { useState, useCallback } from "react";
import { ON_AIR_THEMES, type OnAirThemeId } from "./player-view-model";
import { PERSONAS, type Persona } from "./skin-config";

/**
 * 管理用户偏好（主题、DJ persona、头像、音量），自动同步到 localStorage。
 */
export function usePlayerPrefs() {
  const [theme, setTheme] = useState<OnAirThemeId>(() => {
    if (typeof window === "undefined") return "amber";
    const saved = localStorage.getItem("fakeradio-theme") as OnAirThemeId | null;
    if (saved && ON_AIR_THEMES.includes(saved)) return saved;
    return "amber";
  });

  const [selectedPersona, setSelectedPersona] = useState<Persona>(() => {
    if (typeof window === "undefined") return Object.values(PERSONAS)[0]!;
    const savedPersonaId = localStorage.getItem("fakeradio-persona");
    if (savedPersonaId) {
      const found = Object.values(PERSONAS).find((p) => p.short === savedPersonaId);
      if (found) return found;
    }
    return Object.values(PERSONAS)[0]!;
  });

  const [avatarSrc, setAvatarSrc] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("fakeradio-avatar");
  });

  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem("fakeradio-volume");
    return saved !== null ? Number(saved) : 1;
  });

  const [showSettings, setShowSettings] = useState(false);

  const handleThemeChange = useCallback((newTheme: OnAirThemeId) => {
    setTheme(newTheme);
    localStorage.setItem("fakeradio-theme", newTheme);
  }, []);

  const handlePersonaChange = useCallback((persona: Persona) => {
    setSelectedPersona(persona);
    localStorage.setItem("fakeradio-persona", persona.short);
  }, []);

  const handleAvatarUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAvatarSrc(dataUrl);
      localStorage.setItem("fakeradio-avatar", dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAvatarRemove = useCallback(() => {
    setAvatarSrc(null);
    localStorage.removeItem("fakeradio-avatar");
  }, []);

  const handleAvatarClick = useCallback(() => {
    setShowSettings((s) => !s);
  }, []);

  return {
    theme,
    handleThemeChange,
    selectedPersona,
    handlePersonaChange,
    avatarSrc,
    handleAvatarUpload,
    handleAvatarRemove,
    showSettings,
    handleAvatarClick,
    volume,
    setVolume,
  };
}
