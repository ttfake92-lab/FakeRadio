"use client";

import { useEffect, useState } from "react";
import type { Settings as SettingsType } from "@fakeradio/shared";
import { getSettings, updateSettings } from "../../lib/api-client";

export type SettingsPanelProps = {
  isExpanded: boolean;
  isOpen: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
};

export function SettingsPanel({ isExpanded, isOpen, onToggleExpand, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const response = await getSettings();
      setSettings(response.settings);
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleSettingChange = async <K extends keyof SettingsType>(
    key: K,
    value: SettingsType[K]
  ) => {
    if (!settings) return;
    setSaving(true);
    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      const response = await updateSettings(newSettings);
      setSettings(response.settings);
    } catch (e) {
      console.error("Failed to update settings", e);
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 16,
        left: 16,
        width: isExpanded ? "min(400px, calc(100vw - 32px))" : "min(200px, calc(100vw - 32px))",
        maxHeight: isExpanded ? "calc(100vh - 160px)" : "auto",
        background: "rgba(10, 10, 10, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "width 0.2s ease, transform 0.2s ease",
        zIndex: 100,
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: isExpanded ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
          cursor: "pointer",
          background: "rgba(255, 255, 255, 0.02)",
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚙️</span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
            {isExpanded ? "Settings" : "设置"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              fontSize: 16,
              padding: 4,
            }}
          >
            ✕
          </button>
          <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11 }}>
            {isExpanded ? "▼" : "▶"}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: 16, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13, margin: 0 }}>
                加载中…
              </p>
            </div>
          ) : settings ? (
            <>
              <SettingSection title="研究设置">
                <ToggleSetting
                  label="启用外部资料研究"
                  description="使用 web research 为节目收集背景信息"
                  checked={settings.researchEnabled}
                  onChange={(v) => handleSettingChange("researchEnabled", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="音乐 Provider">
                <SelectSetting
                  label="Provider 模式"
                  description="选择音乐来源"
                  value={settings.providerMode}
                  options={[
                    { value: "auto", label: "自动 (优先真实)" },
                    { value: "netease", label: "网易云音乐" },
                    { value: "mock", label: "模拟数据" },
                  ]}
                  onChange={(v) => handleSettingChange("providerMode", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="TTS 语音">
                <SelectSetting
                  label="TTS Provider"
                  description="选择语音合成引擎"
                  value={settings.ttsProvider}
                  options={[
                    { value: "edge", label: "Edge TTS" },
                    { value: "mimo", label: "MIMO TTS" },
                  ]}
                  onChange={(v) => handleSettingChange("ttsProvider", v)}
                  disabled={saving}
                />
                <TextSetting
                  label="Edge TTS 语音"
                  description="Edge TTS 的语音 ID"
                  value={settings.ttsVoice}
                  onChange={(v) => handleSettingChange("ttsVoice", v)}
                  disabled={saving}
                />
                <TextSetting
                  label="MIMO 语音"
                  description="MIMO TTS 的语音名称"
                  value={settings.mimoVoice}
                  onChange={(v) => handleSettingChange("mimoVoice", v)}
                  disabled={saving}
                />
              </SettingSection>

              <SettingSection title="隐私">
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

              <SettingSection title="节目制作">
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
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13, margin: "0 0 8px" }}>
                加载失败
              </p>
              <button
                onClick={loadSettings}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background: "transparent",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                重试
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
          fontSize: 11,
          color: "rgba(255, 255, 255, 0.4)",
          marginBottom: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
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
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ marginTop: 3, cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11 }}>
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
  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, marginBottom: 6 }}>
        {description}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.15)",
          background: "rgba(255, 255, 255, 0.05)",
          color: "#fff",
          fontSize: 12,
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
  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, marginBottom: 6 }}>
        {description}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.15)",
          background: "rgba(255, 255, 255, 0.05)",
          color: "#fff",
          fontSize: 12,
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
  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: 600 }}>
          {value}%
        </div>
      </div>
      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, marginBottom: 8 }}>
        {description}
      </div>
      <input
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
        }}
      />
    </div>
  );
}
