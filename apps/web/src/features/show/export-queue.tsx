"use client";

import { getProjectExportFiles, downloadProjectFile } from "../../lib/api-client";
import { useState } from "react";

export type ExportTask = {
  id: string;
  projectId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
};

export type ExportQueueProps = {
  isExpanded: boolean;
  isOpen: boolean;
  tasks: ExportTask[];
  onToggleExpand: () => void;
  onClose: () => void;
  onRetry?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
};

export function ExportQueue({
  isExpanded,
  isOpen,
  tasks,
  onToggleExpand,
  onClose,
  onRetry,
  onDelete,
}: ExportQueueProps) {
  if (!isOpen) return null;

  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "running");
  const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "failed");

  const handleDownload = async (task: ExportTask) => {
    setDownloadingProjectId(task.projectId);
    try {
      const files = await getProjectExportFiles(task.projectId);
      for (const file of files) {
        const blob = await downloadProjectFile(task.projectId, file);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Download failed", e);
    } finally {
      setDownloadingProjectId(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: isExpanded ? 500 : 240,
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
          <span style={{ fontSize: 16 }}>📦</span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
            {isExpanded ? "Export Queue" : "导出队列"}
          </span>
          {pendingTasks.length > 0 && (
            <span
              style={{
                padding: "2px 8px",
                background: "rgba(96, 165, 250, 0.2)",
                color: "#60a5fa",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {pendingTasks.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
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
          {tasks.length === 0 ? (
            <EmptyQueue />
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", marginBottom: 8 }}>
                    进行中 ({pendingTasks.length})
                  </div>
                  {pendingTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  downloadingProjectId={downloadingProjectId}
                  {...(onRetry && { onRetry })}
                  onDownload={handleDownload}
                  {...(onDelete && { onDelete })}
                />
              ))}
            </div>
          )}

          {completedTasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", marginBottom: 8 }}>
                已完成 ({completedTasks.length})
              </div>
              {completedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  downloadingProjectId={downloadingProjectId}
                  {...(onRetry && { onRetry })}
                  onDownload={handleDownload}
                  {...(onDelete && { onDelete })}
                />
              ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  downloadingProjectId,
  onRetry,
  onDownload,
  onDelete,
}: {
  task: ExportTask;
  downloadingProjectId: string | null;
  onRetry?: (taskId: string) => void;
  onDownload?: (task: ExportTask) => void;
  onDelete?: (taskId: string) => void;
}) {
  return (
    <div
      style={{
        padding: 12,
        marginBottom: 8,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
          项目 #{task.projectId.slice(0, 8)}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: getTaskStatusColor(task.status),
            color: task.status === "running" ? "#000" : "#fff",
          }}
        >
          {getTaskStatusLabel(task.status)}
        </span>
      </div>

      {task.status === "running" && task.progress !== undefined && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              width: "100%",
              height: 4,
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${task.progress}%`,
                height: "100%",
                background: "#60a5fa",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.4)", marginTop: 4 }}>
            {task.progress}%
          </div>
        </div>
      )}

      {task.error && (
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#f87171" }}>
          {task.error}
        </p>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {task.status === "failed" && onRetry && (
          <button
            onClick={() => onRetry(task.id)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "transparent",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        )}
        {task.status === "completed" && onDownload && (
          <button
            onClick={() => onDownload && onDownload(task)}
            disabled={downloadingProjectId === task.projectId}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "none",
              background: "#4ade80",
              color: "#000",
              fontSize: 11,
              fontWeight: 500,
              cursor: downloadingProjectId === task.projectId ? "not-allowed" : "pointer",
              opacity: downloadingProjectId === task.projectId ? 0.6 : 1,
            }}
          >
            {downloadingProjectId === task.projectId ? "下载中…" : "下载"}
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(task.id)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(248, 113, 113, 0.3)",
              background: "transparent",
              color: "#f87171",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13, margin: "0 0 8px" }}>
        暂无导出任务
      </p>
      <p style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 11, margin: 0 }}>
        生成完成后可以导出节目工程包
      </p>
    </div>
  );
}

function getTaskStatusColor(status: string): string {
  switch (status) {
    case "completed": return "rgba(74, 222, 128, 0.2)";
    case "running": return "#60a5fa";
    case "failed": return "rgba(248, 113, 113, 0.2)";
    case "pending": return "rgba(251, 191, 36, 0.2)";
    default: return "rgba(156, 163, 175, 0.2)";
  }
}

function getTaskStatusLabel(status: string): string {
  switch (status) {
    case "completed": return "完成";
    case "running": return "进行中";
    case "failed": return "失败";
    case "pending": return "等待中";
    default: return status;
  }
}
