import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { ShowLibrary } from "./show-library";
import * as apiClient from "../../lib/api-client";

vi.mock("../../lib/api-client");

const mockDeleteProject = apiClient.deleteProject as ReturnType<typeof vi.fn>;
const mockDeleteProjectTrace = apiClient.deleteProjectTrace as ReturnType<typeof vi.fn>;
const mockGetProjectExportFiles = apiClient.getProjectExportFiles as ReturnType<typeof vi.fn>;
const mockDownloadProjectFile = apiClient.downloadProjectFile as ReturnType<typeof vi.fn>;
const mockExportProject = apiClient.exportProject as ReturnType<typeof vi.fn>;

const mockProjects = [
  {
    id: "project-1",
    briefId: "brief-1",
    slug: "2024-01-15-bee-gees-special",
    status: "ready" as const,
    activePlanId: "plan-1",
    activeJobId: "job-1",
    directoryPath: "/path/to/project-1",
    showPlanPath: "/path/to/project-1/show-plan.json",
    productionTracePath: "/path/to/project-1/production-trace.jsonl",
    showNotesPath: "/path/to/project-1/show-notes.md",
    showAudioPath: "/path/to/project-1/show.mp3",
    createdAt: "2024-01-15T10:00:00.000Z",
    updatedAt: "2024-01-15T12:00:00.000Z",
    completedAt: "2024-01-15T11:30:00.000Z",
  },
  {
    id: "project-2",
    briefId: "brief-2",
    slug: "2024-01-10-daily-mix",
    status: "exported" as const,
    directoryPath: "/path/to/project-2",
    createdAt: "2024-01-10T08:00:00.000Z",
    updatedAt: "2024-01-10T09:00:00.000Z",
  },
];

describe("ShowLibrary 历史节目库", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteProject.mockResolvedValue({ success: true });
    mockDeleteProjectTrace.mockResolvedValue({ success: true });
    mockGetProjectExportFiles.mockResolvedValue({ files: ["show-plan.json", "show.mp3"] });
    mockDownloadProjectFile.mockResolvedValue(new Blob(["test"], { type: "application/json" }));
    mockExportProject.mockResolvedValue({ project: mockProjects[0], files: ["show-plan.json", "show.mp3"] });
  });

  afterEach(() => {
    cleanup();
  });

  it("不打开面板时不显示内容", () => {
    render(<ShowLibrary isExpanded={false} isOpen={false} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    expect(screen.queryByText("历史节目库")).not.toBeInTheDocument();
  });

  it("打开面板时显示项目列表", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });
    expect(screen.getByText("2024-01-10-daily-mix")).toBeInTheDocument();
  });

  it("显示空状态", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={[]} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("暂无历史节目")).toBeInTheDocument();
    });
  });

  it("点击删除项目时显示确认对话框", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "DEL" });
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText("删除节目工程")).toBeInTheDocument();
    });
  });

  it("确认删除项目后调用 API", async () => {
    const handleRefresh = vi.fn();
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={handleRefresh} />);
    
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "DEL" });
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText("删除节目工程")).toBeInTheDocument();
    });

    const confirmButton = screen.getByText("删除");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalledWith("project-1");
    });
    await waitFor(() => {
      expect(handleRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("取消删除项目时不调用 API", async () => {
    const handleRefresh = vi.fn();
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={handleRefresh} />);
    
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "DEL" });
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText("删除节目工程")).toBeInTheDocument();
    });

    const cancelButton = screen.getByText("取消");
    fireEvent.click(cancelButton);

    vi.useFakeTimers();
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(handleRefresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("点击删除 trace 时显示确认对话框", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });

    const deleteTraceButtons = screen.getAllByRole("button", { name: "TRACE" });
    fireEvent.click(deleteTraceButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText("删除 Trace 信息")).toBeInTheDocument();
    });
  });

  it("确认删除 trace 后调用 API", async () => {
    const handleRefresh = vi.fn();
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={handleRefresh} />);
    
    await waitFor(() => {
      expect(screen.getByText("2024-01-15-bee-gees-special")).toBeInTheDocument();
    });

    const deleteTraceButtons = screen.getAllByRole("button", { name: "TRACE" });
    fireEvent.click(deleteTraceButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText("删除 Trace 信息")).toBeInTheDocument();
    });

    const confirmButton = screen.getByText("删除");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteProjectTrace).toHaveBeenCalledWith("project-1");
    });
    await waitFor(() => {
      expect(handleRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("点击刷新按钮调用 onRefresh", async () => {
    const handleRefresh = vi.fn();
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={handleRefresh} />);
    
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole("button", { name: "刷新" });
    fireEvent.click(refreshButton);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it("点击关闭按钮调用 onClose", async () => {
    const handleClose = vi.fn();
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={handleClose} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "关闭" });
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("点击展开/折叠调用 onToggleExpand", async () => {
    const handleToggleExpand = vi.fn();
    const { rerender } = render(<ShowLibrary isExpanded={false} isOpen={true} projects={mockProjects} onToggleExpand={handleToggleExpand} onClose={() => {}} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText(">")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(">"));
    expect(handleToggleExpand).toHaveBeenCalledTimes(1);

    rerender(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={handleToggleExpand} onClose={() => {}} onRefresh={() => {}} />);
    expect(screen.getByText("V")).toBeInTheDocument();
  });

  it("项目状态显示正确的标签", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getAllByText("READY").length).toBeGreaterThan(0);
      expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
    });
  });

  it("项目显示相关的图标标签", async () => {
    render(<ShowLibrary isExpanded={true} isOpen={true} projects={mockProjects} onToggleExpand={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getAllByText("PLAN").length).toBeGreaterThan(0);
      expect(screen.getAllByText("TRACE").length).toBeGreaterThan(0);
      expect(screen.getAllByText("NOTES").length).toBeGreaterThan(0);
      expect(screen.getAllByText("AUDIO").length).toBeGreaterThan(0);
    });
  });
});
