import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "./settings-panel";
import * as apiClient from "../../lib/api-client";

vi.mock("../../lib/api-client");

const mockGetSettings = apiClient.getSettings as ReturnType<typeof vi.fn>;
const mockUpdateSettings = apiClient.updateSettings as ReturnType<typeof vi.fn>;
const mockGetTtsVoices = apiClient.getTtsVoices as ReturnType<typeof vi.fn>;

const defaultSettings = {
  researchEnabled: true,
  providerMode: "netease" as const,
  neteaseBaseUrl: "http://127.0.0.1:3300",
  neteaseTimeoutMs: 2500,
  neteaseAudioLevel: "higher" as const,
  ttsProvider: "grok" as const,
  ttsVoice: "eve",
  mimoVoice: "crimson",
  fishVoiceId: "",
  ttsStyle: "",
  ttsRate: 0,
  tracePrivacy: "summary" as const,
  externalTrackLimit: 60,
  dailyShowAvoidRecentPlay: true,
  themeShowAvoidRecentPlay: false,
};

describe("SettingsPanel 用户流", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({ settings: defaultSettings });
    mockUpdateSettings.mockImplementation(async (settings) => ({ settings }));
    mockGetTtsVoices.mockResolvedValue({ mimo: [], grok: [], grokStyles: [{ value: "", label: "自然" }] });
  });

  afterEach(() => {
    cleanup();
  });

  it("挂载即加载设置", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("可以切换外部资料研究设置", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText("启用外部资料研究")).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("启用外部资料研究");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        researchEnabled: false,
      });
    });
  });

  it("不显示模拟 Provider，且可以修改网易云 API 地址", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("Provider 模式")).toBeInTheDocument();
    });

    const providerSelect = screen.getByLabelText("Provider 模式");
    expect(providerSelect).not.toHaveTextContent("Mock");

    const input = screen.getByLabelText("网易云 API 地址");
    fireEvent.change(input, { target: { value: "http://127.0.0.1:3301" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        neteaseBaseUrl: "http://127.0.0.1:3301",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("设置已生效")).toBeInTheDocument();
    });
  });

  it("可以修改 TTS Provider", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("TTS Provider")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("TTS Provider");
    fireEvent.change(select, { target: { value: "mimo" } });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        ttsProvider: "mimo",
      });
    });
  });

  it("切到 Fish Audio 且 Voice ID 为空时不推服务端，填入 Voice ID 后一次性生效", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("TTS Provider")).toBeInTheDocument();
    });

    // 切到 fish：Voice ID 还没填，不应触发保存（否则服务端进入 disabled 过渡态，
    // 后台预热会在这个窗口内降级到系统 say 音频）
    fireEvent.change(screen.getByLabelText("TTS Provider"), { target: { value: "fish" } });

    await waitFor(() => {
      expect(screen.getByText("已切到 Fish Audio，填入 Voice ID 后设置才会生效")).toBeInTheDocument();
    });
    expect(mockUpdateSettings).not.toHaveBeenCalled();

    // 填入 Voice ID：provider + ID 作为一份完整设置一次性保存
    const input = screen.getByLabelText("Voice ID");
    fireEvent.change(input, { target: { value: "demo-voice-abc" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        ttsProvider: "fish",
        fishVoiceId: "demo-voice-abc",
      });
    });
    expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
  });

  it("Grok TTS 显示官方音色和风格下拉", async () => {
    mockGetTtsVoices.mockResolvedValue({
      mimo: [],
      grok: [{ value: "ara", label: "Ara · 温暖、友好" }],
      grokStyles: [{ value: "whisper", label: "耳语 <whisper>" }]
    });
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("音色")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("音色"), { target: { value: "ara" } });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        ttsVoice: "ara",
      });
    });

    fireEvent.change(screen.getByLabelText("播报风格"), { target: { value: "whisper" } });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        ttsVoice: "ara",
        ttsStyle: "whisper",
      });
    });
  });

  it("可以修改 Trace 隐私级别", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("Trace 隐私级别")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Trace 隐私级别");
    fireEvent.change(select, { target: { value: "off" } });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        tracePrivacy: "off",
      });
    });
  });

  it("可以修改外部曲目上限", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("外部曲目上限 (%)")).toBeInTheDocument();
    });

    const range = screen.getByLabelText("外部曲目上限 (%)");
    fireEvent.change(range, { target: { value: "80" } });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        ...defaultSettings,
        externalTrackLimit: 80,
      });
    });
  });

  it("API 失败后回滚并重试", async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error("Network error"));

    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText("启用外部资料研究")).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("启用外部资料研究");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(2); // 一次初始加载，一次失败后回滚
    });
  });

  it("加载失败后显示重试按钮", async () => {
    mockGetSettings.mockRejectedValueOnce(new Error("Failed to load"));

    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(2);
    });
  });

  it("分区可折叠：收起后隐藏内容，再点展开", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText("启用外部资料研究")).toBeInTheDocument();
    });

    const sectionToggle = screen.getByRole("button", { name: /Research/ });
    expect(sectionToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(sectionToggle);
    expect(screen.queryByText("启用外部资料研究")).not.toBeInTheDocument();

    fireEvent.click(sectionToggle);
    expect(screen.getByText("启用外部资料研究")).toBeInTheDocument();
  });
});
