"use client";

import { useState } from "react";
import type { ProgramBrief, ShowPlan, ShowJob } from "@fakeradio/shared";
import { exportProject } from "../../lib/api-client";

export type ProductionBoardProps = {
  brief?: ProgramBrief | null;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onExportStart?: (projectId: string) => void;
};

export function ProductionBoard({ brief, showPlan, jobs, isExpanded, onToggleExpand, onClose, onExportStart }: ProductionBoardProps) {
  const [includeTrace, setIncludeTrace] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const completedJob = jobs?.find((j) => j.status === "completed");

  const handleExport = async () => {
    if (!completedJob) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportProject(completedJob.planId, { includeTrace });
      if (onExportStart) {
        onExportStart(completedJob.planId);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
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
          {brief || showPlan ? (
            <ShowProjectView
              {...(brief !== undefined && { brief })}
              {...(showPlan !== undefined && { showPlan })}
              {...(jobs !== undefined && { jobs })}
              {...(completedJob !== undefined && { completedJob })}
              includeTrace={includeTrace}
              onIncludeTraceChange={setIncludeTrace}
              onExport={handleExport}
              isExporting={isExporting}
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

function ShowProjectView({
  brief,
  showPlan,
  jobs,
  completedJob,
  includeTrace = true,
  onIncludeTraceChange,
  onExport,
  isExporting = false,
  exportError = null,
}: {
  brief?: ProgramBrief | null;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  completedJob?: ShowJob;
  includeTrace?: boolean;
  onIncludeTraceChange?: (v: boolean) => void;
  onExport?: () => void;
  isExporting?: boolean;
  exportError?: string | null;
}) {
  return (
    <div style={{ color: "#fff" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#e8a04a" }}>
          {brief?.topic ?? "未命名节目"}
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255, 255, 255, 0.6)" }}>
          {brief?.type ?? "theme-show"} · {brief?.status ?? "draft"}
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

      {completedJob && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginBottom: 8 }}>
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
                disabled={isExporting}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4ade80",
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isExporting ? "not-allowed" : "pointer",
                  opacity: isExporting ? 0.6 : 1,
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
