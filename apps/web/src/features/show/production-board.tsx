"use client";

import { useState } from "react";
import type { ProgramBrief, ShowPlan, ShowJob, ShowProject } from "@fakeradio/shared";
import { exportProject, deleteProject, deleteProjectTrace } from "../../lib/api-client";

export type ProductionBoardProps = {
  brief?: ProgramBrief | null;
  briefs?: ProgramBrief[] | undefined;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  projects?: ShowProject[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onSwitchBrief?: ((briefId: string) => void | Promise<void>) | undefined;
  onExportStart?: (projectId: string) => void;
  onProjectsChanged?: (() => void) | undefined;
};

export function ProductionBoard({ brief, briefs, showPlan, jobs, projects, isExpanded, onToggleExpand, onClose, onSwitchBrief, onExportStart, onProjectsChanged }: ProductionBoardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [includeTrace, setIncludeTrace] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const completedJob = jobs?.find((j) => j.status === "completed");
  
  let activeProject: ShowProject | undefined;
  if (selectedProjectId && projects) {
    activeProject = projects.find(p => p.id === selectedProjectId);
  } else if (completedJob && projects) {
    activeProject = projects.find(p => p.activeJobId === completedJob.id) || 
      (completedJob.briefId ? projects.find(p => p.briefId === completedJob.briefId) : undefined);
  }

  const handleExport = async () => {
    if (!activeProject) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportProject(activeProject.id, { includeTrace });
      if (onExportStart) {
        onExportStart(activeProject.id);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProject) return;
    if (!confirm(`确定要删除节目 "${activeProject.slug}" 吗？`)) return;
    setIsDeleting(true);
    try {
      await deleteProject(activeProject.id);
      setSelectedProjectId(null);
      if (onProjectsChanged) {
        onProjectsChanged();
      }
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTrace = async () => {
    if (!activeProject) return;
    if (!confirm("确定要删除该节目的制作 trace 吗？")) return;
    setIsDeleting(true);
    try {
      await deleteProjectTrace(activeProject.id);
      if (onProjectsChanged) {
        onProjectsChanged();
      }
    } catch (e) {
      console.error("Delete trace failed:", e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 16,
        width: isExpanded ? 400 : 200,
        maxHeight: isExpanded ? "calc(100vh - 160px)" : "auto",
        background: "rgba(0, 0, 0, 0.85)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "width 0.2s ease",
        zIndex: 100,
        backdropFilter: "blur(8px)",
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
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📻</span>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
            {isExpanded ? "Production Board" : "制作台"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ✕
          </button>
          <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 12 }}>
            {isExpanded ? "▼" : "▶"}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: 16, maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
          <BriefSelector
            briefs={briefs ?? []}
            activeBriefId={brief?.id}
            onSwitchBrief={onSwitchBrief}
          />
          
          <ProjectSelector
            projects={projects ?? []}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
          
          {brief || showPlan || activeProject ? (
            <ShowProjectView
              {...(brief !== undefined && { brief })}
              {...(showPlan !== undefined && { showPlan })}
              {...(jobs !== undefined && { jobs })}
              project={activeProject}
              includeTrace={includeTrace}
              onIncludeTraceChange={setIncludeTrace}
              onExport={handleExport}
              onDeleteProject={handleDeleteProject}
              onDeleteTrace={handleDeleteTrace}
              isExporting={isExporting}
              isDeleting={isDeleting}
              exportError={exportError}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
}

function BriefSelector({
  briefs,
  activeBriefId,
  onSwitchBrief,
}: {
  briefs?: ProgramBrief[] | undefined;
  activeBriefId?: string | null | undefined;
  onSwitchBrief?: ((briefId: string) => void | Promise<void>) | undefined;
}) {
  if (!briefs || briefs.length <= 1) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        选择 Brief
      </div>
      <select
        value={activeBriefId ?? ""}
        onChange={(e) => onSwitchBrief && onSwitchBrief(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontSize: 12,
        }}
      >
        {briefs.map((b) => (
          <option key={b.id} value={b.id}>
            {b.topic} · {b.status}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProjectSelector({
  projects,
  selectedProjectId,
  onSelectProject,
}: {
  projects: ShowProject[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        历史节目
      </div>
      <select
        value={selectedProjectId ?? ""}
        onChange={(e) => onSelectProject(e.target.value || null)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontSize: 12,
        }}
      >
        <option value="">当前制作</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.slug} · {p.status}
          </option>
        ))}
      </select>
    </div>
  );
}

function ShowProjectView({
  brief,
  showPlan,
  jobs,
  project,
  includeTrace = true,
  onIncludeTraceChange,
  onExport,
  onDeleteProject,
  onDeleteTrace,
  isExporting = false,
  isDeleting = false,
  exportError = null,
}: {
  brief?: ProgramBrief | null;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  project?: ShowProject | undefined;
  includeTrace?: boolean;
  onIncludeTraceChange?: (v: boolean) => void;
  onExport?: () => void;
  onDeleteProject?: () => void;
  onDeleteTrace?: () => void;
  isExporting?: boolean;
  isDeleting?: boolean;
  exportError?: string | null;
}) {
  return (
    <div style={{ color: "#fff" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#e8a04a" }}>
          {brief?.topic ?? project?.slug ?? "未命名节目"}
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255, 255, 255, 0.6)" }}>
          {brief?.type ?? "theme-show"} · {brief?.status ?? project?.status ?? "draft"}
        </p>
      </div>

      {showPlan ? (
        <div>
          <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginBottom: 8 }}>
            {showPlan.blocks?.length ?? 0} 个段落
          </div>
          {showPlan.blocks?.map((block, idx) => (
            <BlockView key={idx} block={block} idx={idx} />
          ))}
        </div>
      ) : (
        <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13 }}>
          暂无 ShowPlan
        </p>
      )}

      {jobs && jobs.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginBottom: 8 }}>
            任务 ({jobs.length})
          </div>
          {jobs.map((job, idx) => (
            <JobView key={idx} job={job} />
          ))}
        </div>
      )}

      {project && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            导出节目
          </div>
          
          {onIncludeTraceChange && onExport && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeTrace}
                  onChange={(e) => onIncludeTraceChange(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: "#fff" }}>包含制作 trace</span>
              </label>

              <button
                onClick={onExport}
                disabled={isExporting || isDeleting}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4ade80",
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (isExporting || isDeleting) ? "not-allowed" : "pointer",
                  opacity: (isExporting || isDeleting) ? 0.6 : 1,
                  marginBottom: 8,
                }}
              >
                {isExporting ? "导出中…" : "📦 导出节目包"}
              </button>
            </>
          )}

          {exportError && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#f87171", margin: "8px 0 0" }}>
              {exportError}
            </p>
          )}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
              管理
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onDeleteTrace && project.productionTracePath && (
                <button
                  onClick={onDeleteTrace}
                  disabled={isDeleting || isExporting}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "transparent",
                    color: "#fff",
                    fontSize: 12,
                    cursor: (isDeleting || isExporting) ? "not-allowed" : "pointer",
                    opacity: (isDeleting || isExporting) ? 0.5 : 1,
                  }}
                >
                  删除 Trace
                </button>
              )}
              {onDeleteProject && (
                <button
                  onClick={onDeleteProject}
                  disabled={isDeleting || isExporting}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(248,113,113,0.5)",
                    background: "transparent",
                    color: "#f87171",
                    fontSize: 12,
                    cursor: (isDeleting || isExporting) ? "not-allowed" : "pointer",
                    opacity: (isDeleting || isExporting) ? 0.5 : 1,
                  }}
                >
                  删除节目
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockView({ block, idx }: { block: any; idx: number }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)" }}>
          #{idx + 1}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 6px",
            background: "rgba(232, 160, 74, 0.2)",
            color: "#e8a04a",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {block.role ?? "segment"}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {block.title ?? "未命名段落"}
      </div>
      {block.storyGoal && (
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255, 255, 255, 0.6)" }}>
          {block.storyGoal}
        </p>
      )}
      {block.episodes && block.episodes.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", marginBottom: 4 }}>
             Episodes ({block.episodes.length})
          </div>
          {block.episodes.map((ep: any, epIdx: number) => (
            <EpisodeView key={epIdx} episode={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

function EpisodeView({ episode }: { episode: any }) {
  return (
    <div
      style={{
        padding: "6px 8px",
        marginBottom: 4,
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: 4,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>
        {episode.status === "completed" ? "✓" : episode.status === "generating" ? "⚙" : "○"}
      </span>
      <span style={{ color: "#fff", flex: 1 }}>
        {episode.track?.title ?? episode.title ?? "未命名"}
      </span>
      <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10 }}>
        {episode.track?.artist ?? ""}
      </span>
    </div>
  );
}

function JobView({ job }: { job: any }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        marginBottom: 6,
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: 6,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span style={{ color: "#fff" }}>
        {job.type ?? "job"}
      </span>
      <span
        style={{
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 500,
          background: getJobStatusColor(job.status),
          color: "#000",
        }}
      >
        {job.status ?? "pending"}
      </span>
    </div>
  );
}

function getJobStatusColor(status: string | undefined): string {
  switch (status) {
    case "completed": return "#4ade80";
    case "running": return "#60a5fa";
    case "failed": return "#f87171";
    case "pending": return "#fbbf24";
    default: return "#9ca3af";
  }
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 13, margin: "0 0 8px" }}>
        暂无制作项目
      </p>
      <p style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 11, margin: 0 }}>
        在聊天中告诉 DJ 你的制作意图
      </p>
    </div>
  );
}
