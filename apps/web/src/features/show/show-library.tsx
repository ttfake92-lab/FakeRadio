"use client";

import type { ShowProject } from "@fakeradio/shared";
import { useState, useMemo } from "react";
import { deleteProject, deleteProjectTrace, getProjectExportFiles, downloadProjectFile } from "../../lib/api-client";
import { downloadBlob } from "../../lib/download-blob";

export type ShowLibraryProps = {
  isExpanded: boolean;
  isOpen: boolean;
  projects: ShowProject[];
  onToggleExpand: () => void;
  onClose: () => void;
  onRefresh: () => void;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "generating":
      return "生成中";
    case "ready":
      return "已完成";
    case "failed":
      return "失败";
    case "exported":
      return "已导出";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ready":
      return "rgba(74, 222, 128, 0.2)";
    case "generating":
      return "#60a5fa";
    case "failed":
      return "rgba(248, 113, 113, 0.2)";
    case "exported":
      return "rgba(167, 139, 250, 0.2)";
    default:
      return "rgba(156, 163, 175, 0.2)";
  }
}

export function ShowLibrary({
  isExpanded,
  isOpen,
  projects,
  onToggleExpand,
  onClose,
  onRefresh,
}: ShowLibraryProps) {
  const sortedProjects = useMemo(() => {
    return [...projects].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [projects]);

  if (!isOpen) return null;

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTraceId, setDeletingTraceId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{
    id: string;
    type: "project" | "trace";
  } | null>(null);

  const handleDeleteProject = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete project:", error);
    } finally {
      setDeletingId(null);
      setShowConfirmDelete(null);
    }
  };

  const handleDeleteTrace = async (projectId: string) => {
    setDeletingTraceId(projectId);
    try {
      await deleteProjectTrace(projectId);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete trace:", error);
    } finally {
      setDeletingTraceId(null);
      setShowConfirmDelete(null);
    }
  };

  const handleDownload = async (project: ShowProject) => {
    setDownloadingId(project.id);
    try {
      const files = await getProjectExportFiles(project.id);
      const fileList = Array.isArray(files) ? files : files.files ?? [];
      for (const file of fileList) {
        const blob = await downloadProjectFile(project.id, file);
        downloadBlob(blob, file);
      }
    } catch (error) {
      console.error("Failed to download project files:", error);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: isExpanded ? "min(520px, calc(100vw - 32px))" : "min(240px, calc(100vw - 32px))",
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
          <span style={{ fontSize: 16 }}>📚</span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
            {isExpanded ? "历史节目库" : "节目库"}
          </span>
          {projects.length > 0 && (
            <span
              style={{
                padding: "2px 8px",
                background: "rgba(167, 139, 250, 0.2)",
                color: "#a78bfa",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {projects.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            aria-label="刷新"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              fontSize: 14,
              padding: 4,
            }}
          >
            ↻
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="关闭"
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
        <div
          style={{
            padding: 16,
            maxHeight: "calc(100vh - 260px)",
            overflowY: "auto",
          }}
        >
          {sortedProjects.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedProjects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isDeleting={deletingId === project.id}
                  isDeletingTrace={deletingTraceId === project.id}
                  isDownloading={downloadingId === project.id}
                  onDelete={() =>
                    setShowConfirmDelete({ id: project.id, type: "project" })
                  }
                  onDeleteTrace={() =>
                    setShowConfirmDelete({ id: project.id, type: "trace" })
                  }
                  onDownload={() => handleDownload(project)}
                />
              ))}
            </div>
          )}

          {showConfirmDelete && (
            <ConfirmDialog
              title={
                showConfirmDelete.type === "project"
                  ? "删除节目工程"
                  : "删除 Trace 信息"
              }
              message={
                showConfirmDelete.type === "project"
                  ? "确定要删除这个节目工程吗？此操作无法撤销。"
                  : "确定要删除这个节目的 Trace 信息吗？此操作无法撤销。"
              }
              confirmText="删除"
              cancelText="取消"
              onConfirm={() => {
                if (showConfirmDelete.type === "project") {
                  handleDeleteProject(showConfirmDelete.id);
                } else {
                  handleDeleteTrace(showConfirmDelete.id);
                }
              }}
              onCancel={() => setShowConfirmDelete(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13, margin: "0 0 8px" }}>
        暂无历史节目
      </p>
      <p style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 11, margin: 0 }}>
        生成并保存节目后，它们会显示在这里
      </p>
    </div>
  );
}

type ProjectItemProps = {
  project: ShowProject;
  isDeleting: boolean;
  isDeletingTrace: boolean;
  isDownloading: boolean;
  onDelete: () => void;
  onDeleteTrace: () => void;
  onDownload: () => void;
};

function ProjectItem({
  project,
  isDeleting,
  isDeletingTrace,
  isDownloading,
  onDelete,
  onDeleteTrace,
  onDownload,
}: ProjectItemProps) {
  const hasTrace = !!project.productionTracePath;
  const canDownload = project.status === "ready" || project.status === "exported";

  return (
    <div
      style={{
        padding: 12,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.slug}
          </p>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: 11,
              margin: "4px 0 0 0",
            }}
          >
            {formatDate(project.createdAt)}
          </p>
        </div>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: getStatusColor(project.status),
            color: project.status === "generating" ? "#000" : "#fff",
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {getStatusLabel(project.status)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {hasTrace && (
            <span
              style={{
                fontSize: 10,
                color: "rgba(255, 255, 255, 0.4)",
                background: "rgba(156, 163, 175, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              📝 有 Trace
            </span>
          )}
          {project.showPlanPath && (
            <span
              style={{
                fontSize: 10,
                color: "rgba(255, 255, 255, 0.4)",
                background: "rgba(156, 163, 175, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              📋 有 Plan
            </span>
          )}
          {project.showNotesPath && (
            <span
              style={{
                fontSize: 10,
                color: "rgba(255, 255, 255, 0.4)",
                background: "rgba(156, 163, 175, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              📝 有 Notes
            </span>
          )}
          {project.showAudioPath && (
            <span
              style={{
                fontSize: 10,
                color: "rgba(255, 255, 255, 0.4)",
                background: "rgba(156, 163, 175, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              🎵 有 Audio
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {canDownload && (
            <button
              onClick={onDownload}
              disabled={isDownloading}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "none",
                background: "#4ade80",
                color: "#000",
                fontSize: 11,
                fontWeight: 500,
                cursor: isDownloading ? "not-allowed" : "pointer",
                opacity: isDownloading ? 0.6 : 1,
              }}
            >
              {isDownloading ? "下载中…" : "下载"}
            </button>
          )}
          {hasTrace && (
            <button
              onClick={onDeleteTrace}
              disabled={isDeletingTrace}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid rgba(251, 191, 36, 0.3)",
                background: "transparent",
                color: "#fbbf24",
                fontSize: 11,
                cursor: isDeletingTrace ? "not-allowed" : "pointer",
                opacity: isDeletingTrace ? 0.6 : 1,
              }}
            >
              {isDeletingTrace ? "删除中…" : "删 Trace"}
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isDeleting}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(248, 113, 113, 0.3)",
              background: "transparent",
              color: "#f87171",
              fontSize: 11,
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "rgba(20, 20, 20, 0.98)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: 12,
          padding: 20,
          maxWidth: 320,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            margin: "0 0 12px 0",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: "rgba(255, 255, 255, 0.7)",
            fontSize: 13,
            margin: "0 0 20px 0",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "transparent",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#f87171",
              color: "#000",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
