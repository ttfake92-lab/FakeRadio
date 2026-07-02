"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramBrief, ShowPlan, ShowJob, ShowProject } from "@fakeradio/shared";
import { exportProject, deleteProject, deleteProjectTrace, getProjectExportFiles, downloadProjectFile } from "../../lib/api-client";
import { downloadBlob } from "../../lib/download-blob";
import { getJobsForBrief, getProjectsForBrief, computeActiveProject } from "../../lib/brief-filter";
import { CollapsibleSection, PANEL_LABEL, FIELD_LABEL, FIELD_DESC, FIELD_INPUT, pillButton } from "./panel-ui";

// 制作工作台。只在节目库覆盖层内嵌渲染（frontend 4.0），旧悬浮窗模式已移除。
export type ProductionBoardProps = {
  brief?: ProgramBrief | null;
  briefs?: ProgramBrief[] | undefined;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  projects?: ShowProject[];
  onSwitchBrief?: ((briefId: string) => void | Promise<void>) | undefined;
  onProjectsChanged?: (() => void) | undefined;
  onGenerateNow?: ((briefId: string) => void | Promise<void>) | undefined;
};

export function ProductionBoard({ brief, briefs, showPlan, jobs, projects, onSwitchBrief, onProjectsChanged, onGenerateNow }: ProductionBoardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [includeTrace, setIncludeTrace] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingNow, setIsGeneratingNow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // 导出成功后保留结果, 用来渲染 "下载 MP3 / Show notes" 链接 + 完成提示。
  // 没有这个 state 的时候, Export 按钮点完瞬间就回到 "Export", 看着就像没反应。
  const [exportResult, setExportResult] = useState<{
    projectId: string;
    blocksCount: number;
    showMp3Size?: number;
    date: string;
    files: string[];
  } | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const jobsForBrief = useMemo(() => getJobsForBrief(jobs, brief?.id), [jobs, brief?.id]);
  const projectsForBrief = useMemo(() => getProjectsForBrief(projects, brief?.id), [projects, brief?.id]);

  const activeProject = computeActiveProject(jobs, projects, brief?.id, selectedProjectId) ?? undefined;

  useEffect(() => {
    if (selectedProjectId && brief?.id) {
      const stillValid = projectsForBrief.some(p => p.id === selectedProjectId);
      if (!stillValid) {
        setSelectedProjectId(null);
      }
    }
  }, [brief?.id, selectedProjectId, projectsForBrief]);

  // 切节目 / 切项目时, 把上一次的导出结果清掉, 否则旧节目的下载按钮会留着误导。
  useEffect(() => {
    setExportResult(null);
    setExportError(null);
  }, [brief?.id, selectedProjectId]);

  const handleExport = async () => {
    if (!activeProject) return;
    setIsExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await exportProject(activeProject.id, { includeTrace });
      // 拉一下产出文件列表, 供 UI 渲染下载链接。
      // 拉失败也不算导出失败, 退化成 ["show.mp3"] (后端肯定写了)。
      let files: string[] = ["show.mp3"];
      try {
        const listing = await getProjectExportFiles(activeProject.id);
        if (listing?.files?.length) files = listing.files;
      } catch (e) {
        console.warn("[export] file listing failed, fallback to show.mp3:", e);
      }
      setExportResult({
        projectId: activeProject.id,
        blocksCount: (result as { blocksCount?: number })?.blocksCount ?? 0,
        ...((result as { showMp3Size?: number })?.showMp3Size !== undefined
          ? { showMp3Size: (result as { showMp3Size?: number }).showMp3Size as number }
          : {}),
        date: (result as { date?: string })?.date ?? "",
        files,
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFile = async (projectId: string, file: string) => {
    setDownloadingFile(file);
    try {
      const blob = await downloadProjectFile(projectId, file);
      downloadBlob(blob, file);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : `下载 ${file} 失败`);
    } finally {
      setDownloadingFile(null);
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

  const handleGenerateNow = async () => {
    if (!brief || !onGenerateNow) return;
    // 注意: 父组件 (editorial-radio) 的 onGenerateNow 是 fire-and-forget 设计 -- 它会立刻切视图 +
    // 启动 job 轮询,然后 promise 仍会在后端整条流水线跑完后才 resolve。
    // 这里短时间设 isGeneratingNow 给视觉反馈,但即便用户在 generate 完成前导航走也无所谓。
    setIsGeneratingNow(true);
    setExportError(null);
    try {
      await onGenerateNow(brief.id);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setIsGeneratingNow(false);
    }
  };

  return (
    <div>
      <SelectRow
        label="Brief"
        hidden={!briefs || briefs.length <= 1}
        value={brief?.id ?? ""}
        options={(briefs ?? []).map((b) => ({ value: b.id, label: `${b.topic} · ${b.status}` }))}
        onChange={(v) => onSwitchBrief && onSwitchBrief(v)}
      />

      <SelectRow
        label="History"
        hidden={projectsForBrief.length === 0}
        value={selectedProjectId ?? ""}
        options={[{ value: "", label: "当前制作" }, ...projectsForBrief.map((p) => ({ value: p.id, label: `${p.slug} · ${p.status}` }))]}
        onChange={(v) => setSelectedProjectId(v || null)}
      />

      {brief || showPlan || activeProject ? (
        <ShowProjectView
          {...(brief !== undefined && { brief })}
          {...(showPlan !== undefined && { showPlan })}
          jobs={jobsForBrief}
          project={activeProject}
          onGenerateNow={brief && showPlan && onGenerateNow ? handleGenerateNow : undefined}
          includeTrace={includeTrace}
          onIncludeTraceChange={setIncludeTrace}
          onExport={handleExport}
          onDeleteProject={handleDeleteProject}
          onDeleteTrace={handleDeleteTrace}
          isExporting={isExporting}
          isGeneratingNow={isGeneratingNow}
          isDeleting={isDeleting}
          exportError={exportError}
          exportResult={exportResult}
          onDownloadFile={handleDownloadFile}
          downloadingFile={downloadingFile}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function SelectRow({
  label,
  hidden,
  value,
  options,
  onChange,
}: {
  label: string;
  hidden: boolean;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  if (hidden) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...PANEL_LABEL, marginBottom: 6 }}>{label}</div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...FIELD_INPUT, cursor: "pointer" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
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
  onGenerateNow,
  includeTrace = true,
  onIncludeTraceChange,
  onExport,
  onDeleteProject,
  onDeleteTrace,
  isExporting = false,
  isGeneratingNow = false,
  isDeleting = false,
  exportError = null,
  exportResult = null,
  onDownloadFile,
  downloadingFile = null,
}: {
  brief?: ProgramBrief | null;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  project?: ShowProject | undefined;
  onGenerateNow?: (() => void) | undefined;
  includeTrace?: boolean;
  onIncludeTraceChange?: (v: boolean) => void;
  onExport?: () => void;
  onDeleteProject?: () => void;
  onDeleteTrace?: () => void;
  isExporting?: boolean;
  isGeneratingNow?: boolean;
  isDeleting?: boolean;
  exportError?: string | null;
  exportResult?: {
    projectId: string;
    blocksCount: number;
    showMp3Size?: number;
    date: string;
    files: string[];
  } | null;
  onDownloadFile?: (projectId: string, file: string) => void;
  downloadingFile?: string | null;
}) {
  const busy = isGeneratingNow || isExporting || isDeleting;

  return (
    <div style={{ color: "var(--ink)" }}>
      <div style={{ marginBottom: 14 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-courier)",
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.3,
            color: "var(--ink)",
          }}
        >
          {brief?.topic ?? project?.slug ?? "未命名节目"}
        </h3>
        <p style={{ ...PANEL_LABEL, margin: "5px 0 0" }}>
          {brief?.type ?? "theme-show"} · {brief?.status ?? project?.status ?? "draft"}
        </p>
      </div>

      {showPlan ? (
        <CollapsibleSection title="Plan · 节目编排" extra={<span style={PANEL_LABEL}>{showPlan.blocks?.length ?? 0} BLOCKS</span>}>
          {showPlan.blocks?.map((block, idx) => (
            <BlockView key={idx} block={block} idx={idx} />
          ))}
          {onGenerateNow && (
            <button
              onClick={onGenerateNow}
              disabled={busy}
              style={{
                ...pillButton("primary"),
                width: "100%",
                padding: "10px 16px",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {isGeneratingNow ? "Generating..." : "Generate Now"}
            </button>
          )}
        </CollapsibleSection>
      ) : (
        <p style={{ ...FIELD_DESC, fontStyle: "italic", margin: "0 0 10px" }}>No ShowPlan</p>
      )}

      {jobs && jobs.length > 0 && (
        <CollapsibleSection title="Jobs · 任务" extra={<span style={PANEL_LABEL}>{jobs.length}</span>} defaultOpen={false}>
          {jobs.map((job, idx) => (
            <JobView key={idx} job={job} />
          ))}
        </CollapsibleSection>
      )}

      {project && (
        <CollapsibleSection title="Export · 导出">
          {onIncludeTraceChange && onExport && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeTrace}
                  onChange={(e) => onIncludeTraceChange(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "var(--ink)" }}
                />
                <span style={FIELD_LABEL}>Include trace</span>
              </label>

              <button
                onClick={onExport}
                disabled={isExporting || isDeleting}
                style={{
                  ...pillButton("ghost"),
                  width: "100%",
                  padding: "10px 16px",
                  cursor: (isExporting || isDeleting) ? "not-allowed" : "pointer",
                  opacity: (isExporting || isDeleting) ? 0.6 : 1,
                }}
              >
                {isExporting ? "Exporting…" : "Export"}
              </button>
            </>
          )}

          {exportError && (
            <p style={{ ...FIELD_DESC, color: "var(--danger)", margin: 0 }}>{exportError}</p>
          )}

          {exportResult && exportResult.projectId === project.id && (
            <div>
              <div style={{ ...FIELD_DESC, color: "#4ade80", marginBottom: 8 }}>
                导出完成 · {exportResult.blocksCount} blocks
                {exportResult.showMp3Size ? ` · ${formatBytes(exportResult.showMp3Size)}` : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {exportResult.files.map((file) => (
                  <button
                    key={file}
                    onClick={() => onDownloadFile?.(exportResult.projectId, file)}
                    disabled={downloadingFile === file}
                    style={{
                      ...pillButton("ghost"),
                      padding: "5px 12px",
                      fontSize: 8.5,
                      cursor: downloadingFile === file ? "wait" : "pointer",
                      opacity: downloadingFile === file ? 0.6 : 1,
                    }}
                  >
                    {downloadingFile === file ? "..." : file.replace(/\.[^.]+$/, "").slice(0, 18)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {onDeleteTrace && project.productionTracePath && (
              <button
                onClick={onDeleteTrace}
                disabled={isDeleting || isExporting}
                style={{
                  ...pillButton("danger"),
                  flex: 1,
                  cursor: (isDeleting || isExporting) ? "not-allowed" : "pointer",
                  opacity: (isDeleting || isExporting) ? 0.5 : 1,
                }}
              >
                Del Trace
              </button>
            )}
            {onDeleteProject && (
              <button
                onClick={onDeleteProject}
                disabled={isDeleting || isExporting}
                style={{
                  ...pillButton("danger"),
                  flex: 1,
                  cursor: (isDeleting || isExporting) ? "not-allowed" : "pointer",
                  opacity: (isDeleting || isExporting) ? 0.5 : 1,
                }}
              >
                Del Project
              </button>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function BlockView({ block, idx }: { block: any; idx: number }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={PANEL_LABEL}>#{idx + 1}</span>
        <span style={{ ...PANEL_LABEL, color: "var(--ink)" }}>{block.role ?? "segment"}</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-courier)",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.3,
          marginBottom: 4,
        }}
      >
        {block.title ?? "未命名段落"}
      </div>
      {block.storyGoal && <p style={{ ...FIELD_DESC, margin: 0 }}>{block.storyGoal}</p>}
      {block.episodes && block.episodes.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <div style={{ ...PANEL_LABEL, marginBottom: 4 }}>Episodes ({block.episodes.length})</div>
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
        padding: "5px 0",
        fontSize: 11,
        display: "flex",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <span style={{ ...PANEL_LABEL, flex: "none" }}>
        {episode.status === "completed" ? "OK" : episode.status === "generating" ? ".." : "--"}
      </span>
      <span style={{ color: "var(--ink)", fontFamily: "var(--font-courier)", fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {episode.track?.title ?? episode.title ?? "未命名"}
      </span>
      <span style={{ ...PANEL_LABEL, flex: "none" }}>{episode.track?.artist ?? ""}</span>
    </div>
  );
}

function JobView({ job }: { job: any }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span style={{ ...FIELD_LABEL, fontSize: 10 }}>{job.type ?? "job"}</span>
      <span style={{ ...PANEL_LABEL, color: "var(--ink)" }}>{job.status ?? "pending"}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <p style={{ ...FIELD_DESC, margin: "0 0 8px" }}>暂无制作项目</p>
      <p style={{ ...FIELD_DESC, margin: 0 }}>在聊天中告诉 DJ 你的制作意图</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}
