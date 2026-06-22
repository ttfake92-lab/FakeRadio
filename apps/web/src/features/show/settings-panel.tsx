"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import type { Settings as SettingsType } from "@fakeradio/shared";
import { getSettings, updateSettings, getTtsVoices, previewTts, buildMediaUrl, type TtsVoiceOption } from "../../lib/api-client";

export type SettingsPanelProps = {
  isExpanded: boolean;
  isOpen: boolean;
  embedded?: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
};

export function SettingsPanel({ isExpanded, isOpen, embedded = false, onToggleExpand, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [voices, setVoices] = useState<{ mimo: TtsVoiceOption[]; grok: TtsVoiceOption[]; grokStyles: TtsVoiceOption[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const settingsSnapshotRef = useRef<SettingsType | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const response = await getSettings();
      setSettings(response.settings);
      settingsSnapshotRef.current = response.settings;
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      getTtsVoices().then(setVoices).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current.clear();
    };
  }, []);

  const handleSettingChange = useCallback(<K extends keyof SettingsType>(
    key: K,
    value: SettingsType[K]
  ) => {
    if (!settings) return;
    setSaveMessage(null);
    setSettings((prev) => {
      const updated = prev ? { ...prev, [key]: value } : prev;
      settingsSnapshotRef.current = updated;
      return updated;
    });
    const existingTimer = pendingTimersRef.current.get(key as string);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const currentSettings = settingsSnapshotRef.current;
        if (currentSettings) {
          const response = await updateSettings(currentSettings);
          setSettings(response.settings);
          settingsSnapshotRef.current = response.settings;
          setSaveMessage("设置已生效");
        }
      } catch (e) {
        console.error("Failed to update settings", e);
        setSaveMessage(e instanceof Error ? e.message : "设置应用失败");
        await loadSettings();
      } finally {
        setSaving(false);
        pendingTimersRef.current.delete(key as string);
      }
    }, 300);
    pendingTimersRef.current.set(key as string, timer);
  }, [settings, loadSettings]);

  // 判断音色是中文还是英文(基于 voice value 或当前 voices 列表中的 label)
  const detectLang = useCallback((voice: string, voices: TtsVoiceOption[] | undefined): "zh" | "en" => {
    if (voice.startsWith("en-")) return "en";
    if (voice.startsWith("zh-")) return "zh";
    const matched = voices?.find((o) => o.value === voice);
    if (matched?.label.includes("英文")) return "en";
    if (matched?.label.includes("中文")) return "zh";
    return "zh"; // 默认中文
  }, []);

  const handlePreview = useCallback(async () => {
    if (!settings) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const provider = settings.ttsProvider;
      const voice = provider === "mimo" ? settings.mimoVoice : settings.ttsVoice;
      const voiceList = provider === "mimo" ? voices?.mimo : voices?.grok;
      const lang = detectLang(voice, voiceList);
      const text = lang === "en"
        ? "Welcome to FakeRadio. This is a preview of the current voice."
        : "欢迎收听 FakeRadio,这是当前音色的试听。";
      const { audioUrl } = await previewTts({
        provider,
        voice,
        text,
        style: settings.ttsStyle,
        ...(provider === "grok" ? { rate: settings.ttsRate } : {})
      });
      const audio = previewAudioRef.current;
      if (audio) {
        audio.src = buildMediaUrl(audioUrl) ?? "";
        await audio.play();
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "试听失败");
    } finally {
      setPreviewing(false);
    }
  }, [settings, voices, detectLang]);

  useEffect(() => {
    if (!isOpen) {
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current.clear();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: embedded ? "relative" : "fixed",
        ...(embedded ? {} : { bottom: 80, left: "50%", transform: "translateX(-50%)" }),
        width: embedded ? "100%" : isExpanded ? "min(400px, calc(100vw - 32px))" : "min(200px, calc(100vw - 32px))",
        maxHeight: embedded ? "100%" : isExpanded ? "calc(100vh - 160px)" : "auto",
        background: embedded ? "transparent" : "var(--bg-2)",
        border: embedded ? "none" : "1px solid var(--line)",
        borderRadius: 0,
        overflow: "auto",
        transition: "width 0.2s ease, transform 0.2s ease",
        ...(embedded ? {} : { zIndex: 100 }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: isExpanded ? "1px solid var(--line)" : "none",
          cursor: "pointer",
          background: "var(--ink-soft)",
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text)",
              fontSize: 20,
              fontStyle: "italic",
            }}
          >
            Settings
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="关闭"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--mute)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.15em",
              padding: 4,
            }}
          >
            CLOSE
          </button>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--faint)",
              fontSize: 9,
              letterSpacing: "0.15em",
            }}
          >
            {isExpanded ? "V" : ">"}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: 16, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p
                style={{
                  color: "var(--faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  margin: 0,
                }}
              >
                Loading…
              </p>
            </div>
          ) : settings ? (
            <>
              <SettingSection title="Research">
                <ToggleSetting
                  label="启用外部资料研究"
                  description="使用 web research 为节目收集背景信息"
                  checked={settings.researchEnabled}
                  onChange={(v) => handleSettingChange("researchEnabled", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="Music Provider">
                <SelectSetting
                  label="Provider 模式"
                  description="选择音乐来源"
                  value={settings.providerMode}
                  options={[
                    { value: "netease", label: "网易云音乐" },
                  ]}
                  onChange={(v) => handleSettingChange("providerMode", v)}
                  disabled={saving}
                />
                <TextSetting
                  label="网易云 API 地址"
                  description="本地 NeteaseCloudMusicApi 服务地址"
                  value={settings.neteaseBaseUrl}
                  onChange={(v) => handleSettingChange("neteaseBaseUrl", v)}
                  disabled={saving}
                />
                <TextSetting
                  label="网易云超时 (ms)"
                  description="探测和请求网易云服务的超时时间"
                  value={String(settings.neteaseTimeoutMs)}
                  onChange={(v) => {
                    const next = Number.parseInt(v, 10);
                    if (Number.isFinite(next) && next > 0) handleSettingChange("neteaseTimeoutMs", next);
                  }}
                  disabled={saving}
                />
                <SelectSetting
                  label="网易云音质"
                  description="歌曲 URL 解析时请求的音质级别"
                  value={settings.neteaseAudioLevel}
                  options={[
                    { value: "standard", label: "standard" },
                    { value: "higher", label: "higher" },
                    { value: "exhigh", label: "exhigh" },
                    { value: "lossless", label: "lossless" },
                    { value: "hires", label: "hires" },
                  ]}
                  onChange={(v) => handleSettingChange("neteaseAudioLevel", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="TTS Voice">
                <SelectSetting
                  label="TTS Provider"
                  description="选择语音合成引擎"
                  value={settings.ttsProvider}
                  options={[
                    { value: "grok", label: "Grok TTS" },
                    { value: "mimo", label: "MIMO TTS" },
                  ]}
                  onChange={(v) => handleSettingChange("ttsProvider", v)}
                  disabled={saving}
                />
                {(() => {
                  const isMimo = settings.ttsProvider === "mimo";
                  const presetVoices = isMimo ? (voices?.mimo ?? []) : (voices?.grok ?? []);
                  const currentVoice = isMimo ? settings.mimoVoice : settings.ttsVoice;
                  const voiceOptions = presetVoices.some((o) => o.value === currentVoice)
                    ? presetVoices
                    : [{ value: currentVoice, label: `${currentVoice} (自定义)` }, ...presetVoices];
                  return (
                    <SelectSetting
                      label="音色"
                      description={isMimo ? "MiMo TTS 音色" : "Grok TTS 官方音色"}
                      value={currentVoice}
                      options={voiceOptions}
                      onChange={(v) => handleSettingChange(isMimo ? "mimoVoice" : "ttsVoice", v)}
                      disabled={saving}
                    />
                  );
                })()}
                {settings.ttsProvider === "grok" ? (
                  <SelectSetting
                    label="播报风格"
                    description="Grok TTS 使用官方 speech tags 控制表达方式"
                    value={settings.ttsStyle}
                    options={(() => {
                      const presetStyles = voices?.grokStyles ?? [{ value: "", label: "自然" }];
                      return presetStyles.some((o) => o.value === settings.ttsStyle)
                        ? presetStyles
                        : [{ value: settings.ttsStyle, label: `${settings.ttsStyle} (未匹配 Grok 官方风格)` }, ...presetStyles];
                    })()}
                    onChange={(v) => handleSettingChange("ttsStyle", v)}
                    disabled={saving}
                  />
                ) : (
                  <TextSetting
                    label="播报风格"
                    description="用自然语言描述口播语气，如「温柔治愈」「沉稳深夜」。"
                    value={settings.ttsStyle}
                    onChange={(v) => handleSettingChange("ttsStyle", v)}
                    disabled={saving}
                  />
                )}
                <RangeSetting
                  label="语速"
                  description="Grok TTS 支持。0% 为正常语速。"
                  value={settings.ttsRate}
                  min={-30}
                  max={50}
                  step={5}
                  onChange={(v) => handleSettingChange("ttsRate", v)}
                  disabled={saving || settings.ttsProvider !== "grok"}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handlePreview}
                    disabled={previewing || saving}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 0,
                      border: "1px solid var(--line)",
                      background: "transparent",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: previewing || saving ? "not-allowed" : "pointer",
                      opacity: previewing || saving ? 0.5 : 1,
                    }}
                  >
                    {previewing ? "试听中…" : "试听"}
                  </button>
                  {previewError && (
                    <span style={{ color: "#c44", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em" }}>
                      {previewError}
                    </span>
                  )}
                  <audio ref={previewAudioRef} style={{ display: "none" }} />
                </div>
              </SettingSection>

              <SettingSection title="Privacy">
                <SelectSetting
                  label="Trace 隐私级别"
                  description="控制制作 trace 的展示程度"
                  value={settings.tracePrivacy}
                  options={[
                    { value: "full", label: "完整 (所有细节)" },
                    { value: "summary", label: "摘要 (默认)" },
                    { value: "off", label: "关闭" },
                  ]}
                  onChange={(v) => handleSettingChange("tracePrivacy", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="Production">
                <RangeSetting
                  label="外部曲目上限 (%)"
                  description="主题节目中外部来源曲目的最大比例"
                  value={settings.externalTrackLimit}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => handleSettingChange("externalTrackLimit", v)}
                  disabled={saving}
                />
                <ToggleSetting
                  label="Daily Show 避免最近播放"
                  description="日常节目避开近期播放过的曲目"
                  checked={settings.dailyShowAvoidRecentPlay}
                  onChange={(v) => handleSettingChange("dailyShowAvoidRecentPlay", v)}
                  disabled={saving}
                />
                <ToggleSetting
                  label="主题节目避开最近播放"
                  description="主题节目也避开近期播放过的曲目"
                  checked={settings.themeShowAvoidRecentPlay}
                  onChange={(v) => handleSettingChange("themeShowAvoidRecentPlay", v)}
                  disabled={saving}
                />
              </SettingSection>
              {saveMessage && (
                <p
                  style={{
                    color: saveMessage.includes("失败") || saveMessage.includes("failed") ? "var(--danger)" : "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    margin: "8px 0 0",
                  }}
                >
                  {saveMessage}
                </p>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p
                style={{
                  color: "var(--faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  margin: "0 0 8px",
                }}
              >
                加载失败
              </p>
              <button
                onClick={loadSettings}
                style={{
                  padding: "6px 12px",
                  borderRadius: 0,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--faint)",
          marginBottom: 12,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ marginTop: 3, cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            color: "var(--faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
          }}
        >
          {description}
        </div>
      </div>
    </label>
  );
}

function SelectSetting({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const inputId = React.useId();

  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <label
        htmlFor={inputId}
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <div
        style={{
          color: "var(--faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {description}
      </div>
      <select
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 0,
          border: "1px solid var(--line)",
          background: "var(--ink-soft)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextSetting({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputId = React.useId();
  // 本地 state 隔离 IME(中文输入法)与外部受控:
  // 打字过程中只更新本地,失焦或 Enter 时才向上提交,避免 setSettings 在
  // IME 组合中重置 input、防抖在每个 keystroke 重启导致输入卡顿/丢字。
  const [localValue, setLocalValue] = useState(value);
  const isComposingRef = useRef(false);

  // 外部 value 变化时同步到本地(例如从 server 拉回新值)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commit = useCallback(() => {
    if (localValue !== value) onChange(localValue);
  }, [localValue, value, onChange]);

  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <label
        htmlFor={inputId}
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <div
        style={{
          color: "var(--faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {description}
      </div>
      <input
        id={inputId}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          setLocalValue((e.target as HTMLInputElement).value);
        }}
        onBlur={() => {
          if (!isComposingRef.current) commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isComposingRef.current) {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 0,
          border: "1px solid var(--line)",
          background: "var(--ink-soft)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </div>
  );
}

function RangeSetting({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const inputId = React.useId();

  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <label
          htmlFor={inputId}
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </label>
        <div
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
          }}
        >
          {value}%
        </div>
      </div>
      <div
        style={{
          color: "var(--faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {description}
      </div>
      <input
        id={inputId}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        style={{
          width: "100%",
          cursor: disabled ? "not-allowed" : "pointer",
          accentColor: "var(--text)",
        }}
      />
    </div>
  );
}
