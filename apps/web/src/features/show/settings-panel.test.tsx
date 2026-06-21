import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
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
  ttsProvider: "edge" as const,
  ttsVoice: "zh-CN-XiaoxiaoNeural",
  mimoVoice: "crimson",
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
    mockUpdateSettings.mockResolvedValue({ settings: defaultSettings });
    mockGetTtsVoices.mockResolvedValue({ mimo: [], edge: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("打开面板时加载设置", async () => {
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("不打开面板时不加载设置", async () => {
    vi.useFakeTimers();
    render(<SettingsPanel isExpanded={false} isOpen={false} onToggleExpand={() => {}} onClose={() => {}} />);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(mockGetSettings).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("可以切换外部资料研究设置", async () => {
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
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
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Provider 模式")).toBeInTheDocument();
    });

    const providerSelect = screen.getByLabelText("Provider 模式");
    expect(providerSelect).not.toHaveTextContent("Mock");

    const input = screen.getByLabelText("网易云 API 地址");
    fireEvent.change(input, { target: { value: "http://127.0.0.1:3301" } });

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
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
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

  it("可以修改 Trace 隐私级别", async () => {
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
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
    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
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

    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
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

    render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(2);
    });
  });

  it("关闭面板后不显示内容", async () => {
    const { rerender } = render(<SettingsPanel isExpanded={true} isOpen={true} onToggleExpand={() => {}} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    rerender(<SettingsPanel isExpanded={false} isOpen={false} onToggleExpand={() => {}} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    });
  });

  it("展开/折叠切换", async () => {
    const handleToggleExpand = vi.fn();
    const { rerender } = render(
      <SettingsPanel
        isExpanded={false}
        isOpen={true}
        onToggleExpand={handleToggleExpand}
        onClose={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    // 点击展开
    fireEvent.click(screen.getByText(">"));
    expect(handleToggleExpand).toHaveBeenCalledTimes(1);

    // 切换到展开状态
    rerender(
      <SettingsPanel
        isExpanded={true}
        isOpen={true}
        onToggleExpand={handleToggleExpand}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("V")).toBeInTheDocument();
  });

  it("关闭按钮关闭面板", async () => {
    const handleClose = vi.fn();
    render(
      <SettingsPanel
        isExpanded={true}
        isOpen={true}
        onToggleExpand={() => {}}
        onClose={handleClose}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
