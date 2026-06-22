"use client";

import type { ShowProject } from "@fakeradio/shared";
import React, { useState, useMemo } from "react";
import { deleteProject, deleteProjectTrace, getProjectExportFiles, downloadProjectFile, exportProject } from "../../lib/api-client";
import { downloadBlob } from "../../lib/download-blob";

export type ShowLibraryProps = {
  isExpanded: boolean;
  isOpen: boolean;
  embedded?: boolean;
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
      return "DRAFT";
    case "generating":
      return "WIP";
    case "ready":
      return "READY";
    case "failed":
      return "FAIL";
    case "exported":
      return "DONE";
    case "archived":
      return "ARCH";
    default:
      return status.toUpperCase();
  }
}

export function ShowLibrary({
  isExpanded,
  isOpen,
  embedded = false,
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

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTraceId, setDeletingTraceId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [showConfirmDelete, setShowConfirmDelete] = useState<{
    id: string;
    type: "project" | "trace";
  } | null>(null);

  if (!isOpen) return null;

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
    setItemErrors((prev) => ({ ...prev, [project.id]: "" }));
    try {
      let fileList: string[] = [];
      try {
        const files = await getProjectExportFiles(project.id);
        fileList = Array.isArray(files) ? files : files.files ?? [];
      } catch {
        await exportProject(project.id, { includeTrace: true });
        onRefresh();
        const files = await getProjectExportFiles(project.id);
        fileList = files.files ?? [];
      }
      if (fileList.length === 0) {
        await exportProject(project.id, { includeTrace: true });
        onRefresh();
        const files = await getProjectExportFiles(project.id);
        fileList = files.files ?? [];
      }
      for (const file of fileList) {
        const blob = await downloadProjectFile(project.id, file);
        downloadBlob(blob, file);
      }
    } catch (error) {
      console.error("Failed to download project files:", error);
      setItemErrors((prev) => ({
        ...prev,
        [project.id]: error instanceof Error ? error.message : "下载失败"
      }));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      style={{
        position: embedded ? "relative" : "fixed",
        ...(embedded ? {} : { bottom: 80, left: "50%", transform: "translateX(-50%)" }),
        width: embedded ? "100%" : isExpanded ? "min(520px, calc(100vw - 32px))" : "min(240px, calc(100vw - 32px))",
        maxHeight: embedded ? "100%" : isExpanded ? "calc(100vh - 160px)" : "auto",
        background: embedded ? "transparent" : "var(--bg-2)",
        border: embedded ? "none" : "1px solid var(--line)",
        borderRadius: 0,
        overflow: "auto",
        transition: "width 0.2s ease, transform 0.2s ease",
        ...(embedded ? {} : { zIndex: 100 }),
      }}
    >
      {!embedded && (
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
              Library
            </span>
            {projects.length > 0 && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  padding: "2px 8px",
                  background: "var(--ink-soft)",
                  color: "var(--accent)",
                  borderRadius: 0,
                  fontSize: 9,
                  letterSpacing: "0.15em",
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
                color: "var(--mute)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.15em",
                padding: 4,
              }}
            >
              SYNC
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
      )}

      {(embedded || isExpanded) && (
        <div
          style={{
            padding: embedded ? 0 : 16,
            maxHeight: embedded ? "none" : "calc(100vh - 260px)",
            overflowY: embedded ? "visible" : "auto",
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
                  error={itemErrors[project.id]}
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
      <p
        style={{
          color: "var(--faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          margin: "0 0 8px",
        }}
      >
        暂无历史节目
      </p>
      <p
        style={{
          color: "var(--faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          margin: 0,
        }}
      >
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
  error?: string | undefined;
  onDelete: () => void;
  onDeleteTrace: () => void;
  onDownload: () => void;
};

function ProjectItem({
  project,
  isDeleting,
  isDeletingTrace,
  isDownloading,
  error,
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
        background: "var(--ink-soft)",
        borderRadius: 0,
        border: "1px solid var(--line)",
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
              color: "var(--text)",
              fontFamily: "var(--font-display)",
              fontSize: 16,
              lineHeight: 1.3,
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
              color: "var(--mute)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              margin: "4px 0 0 0",
            }}
          >
            {formatDate(project.createdAt)}
          </p>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            padding: "2px 8px",
            borderRadius: 0,
            fontSize: 9,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            background: "var(--ink-soft)",
            color: "var(--accent)",
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
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                background: "var(--ink-soft)",
                padding: "2px 6px",
                borderRadius: 0,
                letterSpacing: "0.1em",
              }}
            >
              TRACE
            </span>
          )}
          {project.showPlanPath && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                background: "var(--ink-soft)",
                padding: "2px 6px",
                borderRadius: 0,
                letterSpacing: "0.1em",
              }}
            >
              PLAN
            </span>
          )}
          {project.showNotesPath && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                background: "var(--ink-soft)",
                padding: "2px 6px",
                borderRadius: 0,
                letterSpacing: "0.1em",
              }}
            >
              NOTES
            </span>
          )}
          {project.showAudioPath && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                background: "var(--ink-soft)",
                padding: "2px 6px",
                borderRadius: 0,
                letterSpacing: "0.1em",
              }}
            >
              AUDIO
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
                borderRadius: 0,
                border: "1px solid var(--accent)",
                background: "var(--ink-soft)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                cursor: isDownloading ? "not-allowed" : "pointer",
                opacity: isDownloading ? 0.6 : 1,
              }}
            >
              {isDownloading ? "DL…" : "DL"}
            </button>
          )}
          {hasTrace && (
            <button
              onClick={onDeleteTrace}
              disabled={isDeletingTrace}
              style={{
                padding: "4px 8px",
                borderRadius: 0,
                border: "1px solid var(--line)",
                background: "transparent",
                color: "var(--faint)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                cursor: isDeletingTrace ? "not-allowed" : "pointer",
                opacity: isDeletingTrace ? 0.6 : 1,
              }}
            >
              {isDeletingTrace ? "DEL…" : "TRACE"}
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isDeleting}
            style={{
              padding: "4px 8px",
              borderRadius: 0,
              border: "1px solid var(--faint)",
              background: "transparent",
              color: "var(--faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? "DEL…" : "DEL"}
          </button>
        </div>
      </div>
      {error && (
        <p
          style={{
            color: "var(--faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            margin: "8px 0 0",
          }}
        >
          {error}
        </p>
      )}
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
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: 0,
          padding: 20,
          maxWidth: 320,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-display)",
            fontSize: 20,
            margin: "0 0 12px 0",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: "var(--mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
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
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 0,
              border: "1px solid var(--faint)",
              background: "transparent",
              color: "var(--faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
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
