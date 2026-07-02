"use client";

import type { ShowProject } from "@fakeradio/shared";
import React, { useState, useMemo } from "react";
import { deleteProject, deleteProjectTrace, getProjectExportFiles, downloadProjectFile, exportProject } from "../../lib/api-client";
import { downloadBlob } from "../../lib/download-blob";
import { PANEL_LABEL, FIELD_DESC, pillButton } from "./panel-ui";

// 历史节目库列表。只在节目库覆盖层内嵌渲染（frontend 4.0），
// 旧的悬浮窗模式（自带 Library 头部 + 展开箭头）已移除。
export type ShowLibraryProps = {
  projects: ShowProject[];
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

export function ShowLibrary({ projects, onRefresh }: ShowLibraryProps) {
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
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={PANEL_LABEL}>
          {sortedProjects.length} {sortedProjects.length === 1 ? "SHOW" : "SHOWS"}
        </span>
        <button aria-label="刷新" onClick={onRefresh} style={{ ...pillButton("ghost"), padding: "5px 13px" }}>
          SYNC
        </button>
      </div>

      {sortedProjects.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
  );
}

function EmptyLibrary() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <p style={{ ...FIELD_DESC, margin: "0 0 8px" }}>暂无历史节目</p>
      <p style={{ ...FIELD_DESC, margin: 0 }}>生成并保存节目后，它们会显示在这里</p>
    </div>
  );
}

const BADGE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8.5,
  color: "var(--muted)",
  border: "1px solid var(--line)",
  padding: "2px 7px",
  borderRadius: 999,
  letterSpacing: "0.1em",
};

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
  const smallPill = (variant: "ghost" | "danger"): React.CSSProperties => ({
    ...pillButton(variant),
    padding: "4px 10px",
    fontSize: 8.5,
  });

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
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
              color: "var(--ink)",
              fontFamily: "var(--font-courier)",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.3,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.slug}
          </p>
          <p style={{ ...FIELD_DESC, margin: "4px 0 0 0" }}>{formatDate(project.createdAt)}</p>
        </div>
        <span style={{ ...PANEL_LABEL, color: "var(--ink)", marginLeft: 8, flexShrink: 0 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {hasTrace && <span style={BADGE}>TRACE</span>}
          {project.showPlanPath && <span style={BADGE}>PLAN</span>}
          {project.showNotesPath && <span style={BADGE}>NOTES</span>}
          {project.showAudioPath && <span style={BADGE}>AUDIO</span>}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {canDownload && (
            <button
              onClick={onDownload}
              disabled={isDownloading}
              style={{
                ...smallPill("ghost"),
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
                ...smallPill("danger"),
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
              ...smallPill("danger"),
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? "DEL…" : "DEL"}
          </button>
        </div>
      </div>
      {error && <p style={{ ...FIELD_DESC, color: "var(--danger)", margin: "8px 0 0" }}>{error}</p>}
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
        inset: 0,
        // 半透明遮罩：之前用不透明 var(--bg) 会把手机框外的整个页面糊死
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: 20,
          maxWidth: 320,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: "var(--ink)",
            fontFamily: "var(--font-courier)",
            fontSize: 16,
            fontWeight: 700,
            margin: "0 0 10px 0",
          }}
        >
          {title}
        </h3>
        <p style={{ ...FIELD_DESC, fontSize: 10.5, margin: "0 0 18px 0" }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={pillButton("ghost")}>
            {cancelText}
          </button>
          <button onClick={onConfirm} style={pillButton("danger")}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
