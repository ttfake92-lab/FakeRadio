"use client";

import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "../../lib/api-client";
import type { Settings, UpdateSettingsRequest } from "@fakeradio/shared";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await getSettings();
      setSettings(response.settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const updateRequest: UpdateSettingsRequest = {
        researchEnabled: settings.researchEnabled,
        providerMode: settings.providerMode,
        ttsProvider: settings.ttsProvider,
        ttsVoice: settings.ttsVoice,
        mimoVoice: settings.mimoVoice,
        tracePrivacy: settings.tracePrivacy,
        externalTrackLimit: settings.externalTrackLimit,
        dailyShowAvoidRecentPlay: settings.dailyShowAvoidRecentPlay,
        themeShowAvoidRecentPlay: settings.themeShowAvoidRecentPlay,
      };
      await updateSettings(updateRequest);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  }

  function handleChange<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings((prev) => prev ? { ...prev, [key]: value } : null);
  }

  if (loading) {
    return (
      <main className="page settings-page">
        <div className="settings-loading">
          <div className="spinner"></div>
          <p>加载设置中...</p>
        </div>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="page settings-page">
        <div className="settings-error">
          <p>加载设置失败，请刷新页面重试</p>
          <button onClick={loadSettings}>刷新</button>
        </div>
      </main>
    );
  }

  return (
    <main className="page settings-page">
      <div className="settings-header">
        <h1>设置</h1>
        <p>管理电台的各项配置</p>
      </div>

      <div className="settings-sections">
        <section className="settings-section">
          <h2>资料研究</h2>
          <div className="settings-row">
            <label className="settings-label">
              <span>启用外部资料研究</span>
              <span className="settings-hint">控制是否从网络获取歌曲背景信息</span>
            </label>
            <div className="settings-control">
              <button
                className={`toggle ${settings.researchEnabled ? "on" : "off"}`}
                onClick={() => handleChange("researchEnabled", !settings.researchEnabled)}
              >
                <div className="toggle-thumb"></div>
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Provider 设置</h2>
          <div className="settings-row">
            <label className="settings-label">
              <span>音乐 Provider</span>
              <span className="settings-hint">选择音乐来源</span>
            </label>
            <div className="settings-control">
              <select
                value={settings.providerMode}
                onChange={(e) => handleChange("providerMode", e.target.value as Settings["providerMode"])}
                className="settings-select"
              >
                <option value="auto">自动</option>
                <option value="mock">模拟模式</option>
                <option value="netease">网易云音乐</option>
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>语音合成 (TTS)</h2>
          <div className="settings-row">
            <label className="settings-label">
              <span>TTS Provider</span>
              <span className="settings-hint">选择语音合成服务</span>
            </label>
            <div className="settings-control">
              <select
                value={settings.ttsProvider}
                onChange={(e) => handleChange("ttsProvider", e.target.value as Settings["ttsProvider"])}
                className="settings-select"
              >
                <option value="edge">Microsoft Edge TTS</option>
                <option value="mimo">小米 MIMO TTS</option>
              </select>
            </div>
          </div>
          <div className="settings-row">
            <label className="settings-label">
              <span>Edge TTS 音色</span>
              <span className="settings-hint">Microsoft Edge TTS 的语音名称</span>
            </label>
            <div className="settings-control">
              <input
                type="text"
                value={settings.ttsVoice}
                onChange={(e) => handleChange("ttsVoice", e.target.value)}
                className="settings-input"
                placeholder="zh-CN-XiaoxiaoNeural"
              />
            </div>
          </div>
          <div className="settings-row">
            <label className="settings-label">
              <span>MIMO TTS 音色</span>
              <span className="settings-hint">小米 MIMO TTS 的语音名称</span>
            </label>
            <div className="settings-control">
              <input
                type="text"
                value={settings.mimoVoice}
                onChange={(e) => handleChange("mimoVoice", e.target.value)}
                className="settings-input"
                placeholder="茉莉"
              />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>隐私与追踪</h2>
          <div className="settings-row">
            <label className="settings-label">
              <span>Trace 隐私级别</span>
              <span className="settings-hint">控制制作轨迹的详细程度</span>
            </label>
            <div className="settings-control">
              <select
                value={settings.tracePrivacy}
                onChange={(e) => handleChange("tracePrivacy", e.target.value as Settings["tracePrivacy"])}
                className="settings-select"
              >
                <option value="full">完整记录</option>
                <option value="summary">仅摘要</option>
                <option value="off">关闭追踪</option>
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>选歌策略</h2>
          <div className="settings-row">
            <label className="settings-label">
              <span>外部曲目上限</span>
              <span className="settings-hint">主题节目中外部曲目的最大占比 (%)</span>
            </label>
            <div className="settings-control">
              <input
                type="number"
                min="0"
                max="100"
                value={settings.externalTrackLimit}
                onChange={(e) => handleChange("externalTrackLimit", parseInt(e.target.value) || 0)}
                className="settings-input small"
              />
              <span className="settings-unit">%</span>
            </div>
          </div>
          <div className="settings-row">
            <label className="settings-label">
              <span>日常节目避开最近播放</span>
              <span className="settings-hint">Daily Show 模式下是否避开最近播放过的歌曲</span>
            </label>
            <div className="settings-control">
              <button
                className={`toggle ${settings.dailyShowAvoidRecentPlay ? "on" : "off"}`}
                onClick={() => handleChange("dailyShowAvoidRecentPlay", !settings.dailyShowAvoidRecentPlay)}
              >
                <div className="toggle-thumb"></div>
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label className="settings-label">
              <span>主题节目避开最近播放</span>
              <span className="settings-hint">Theme Show 模式下是否避开最近播放过的歌曲</span>
            </label>
            <div className="settings-control">
              <button
                className={`toggle ${settings.themeShowAvoidRecentPlay ? "on" : "off"}`}
                onClick={() => handleChange("themeShowAvoidRecentPlay", !settings.themeShowAvoidRecentPlay)}
              >
                <div className="toggle-thumb"></div>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-actions">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`settings-save-btn ${saved ? "saved" : ""}`}
        >
          {saving ? "保存中..." : saved ? "已保存 ✓" : "保存设置"}
        </button>
      </div>

      <style jsx>{`
        .settings-page {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .settings-header {
          margin-bottom: 30px;
        }

        .settings-header h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1a1a1a;
        }

        .settings-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-section {
          background: #fafafa;
          border-radius: 12px;
          padding: 20px;
        }

        .settings-section h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #333;
          padding-bottom: 12px;
          border-bottom: 1px solid #e0e0e0;
        }

        .settings-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .settings-row:last-child {
          border-bottom: none;
        }

        .settings-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .settings-label span:first-child {
          font-size: 15px;
          font-weight: 500;
          color: #1a1a1a;
        }

        .settings-hint {
          font-size: 12px;
          color: #888;
        }

        .settings-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .settings-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          min-width: 120px;
        }

        .settings-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          min-width: 150px;
        }

        .settings-input.small {
          min-width: 60px;
          text-align: right;
        }

        .settings-unit {
          font-size: 14px;
          color: #666;
          margin-left: 4px;
        }

        .toggle {
          width: 50px;
          height: 28px;
          border-radius: 14px;
          background: #ddd;
          border: none;
          cursor: pointer;
          position: relative;
          transition: background-color 0.2s;
        }

        .toggle.on {
          background: #4a90d9;
        }

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .toggle.on .toggle-thumb {
          transform: translateX(22px);
        }

        .settings-actions {
          margin-top: 30px;
          display: flex;
          justify-content: flex-end;
        }

        .settings-save-btn {
          padding: 12px 24px;
          background: #4a90d9;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .settings-save-btn:hover:not(:disabled) {
          background: #3a80c9;
        }

        .settings-save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-save-btn.saved {
          background: #28a745;
        }

        .settings-loading, .settings-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
        }

        .settings-loading p, .settings-error p {
          margin-top: 16px;
          color: #666;
        }

        .settings-error button {
          margin-top: 16px;
          padding: 8px 16px;
          background: #4a90d9;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #4a90d9;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}