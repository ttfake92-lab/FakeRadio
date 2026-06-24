"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramBrief, ShowPlan, ShowJob, ShowProject } from "@fakeradio/shared";
import { exportProject, deleteProject, deleteProjectTrace, getProjectExportFiles, downloadProjectFile } from "../../lib/api-client";
import { downloadBlob } from "../../lib/download-blob";
import { getJobsForBrief, getProjectsForBrief, computeActiveProject } from "../../lib/brief-filter";

export type ProductionBoardProps = {
  brief?: ProgramBrief | null;
  briefs?: ProgramBrief[] | undefined;
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  projects?: ShowProject[];
  isExpanded: boolean;
  embedded?: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onSwitchBrief?: ((briefId: string) => void | Promise<void>) | undefined;
  onExportStart?: (projectId: string) => void;
  onProjectsChanged?: (() => void) | undefined;
  onGenerateNow?: ((briefId: string) => void | Promise<void>) | undefined;
};

export function ProductionBoard({ brief, briefs, showPlan, jobs, projects, isExpanded, embedded = false, onToggleExpand, onClose, onSwitchBrief, onExportStart, onProjectsChanged, onGenerateNow }: ProductionBoardProps) {
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
      if (onExportStart) {
        onExportStart(activeProject.id);
      }
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
    <div
      style={{
        position: embedded ? "relative" : "fixed",
        ...(embedded ? {} : { bottom: 80, left: 16 }),
        width: embedded ? "100%" : isExpanded ? "min(400px, calc(100vw - 32px))" : "min(200px, calc(100vw - 32px))",
        maxHeight: embedded ? "100%" : isExpanded ? "calc(100vh - 160px)" : "auto",
        background: embedded ? "transparent" : "var(--bg-2)",
        border: embedded ? "none" : "1px solid var(--line)",
        borderRadius: 0,
        overflow: "auto",
        transition: "width 0.2s ease",
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
              Production
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
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
        <div style={{ padding: embedded ? 0 : 16, maxHeight: embedded ? "none" : "calc(100vh - 240px)", overflowY: embedded ? "visible" : "auto" }}>
          <BriefSelector
            briefs={briefs ?? []}
            activeBriefId={brief?.id}
            onSwitchBrief={onSwitchBrief}
          />

          <ProjectSelector
            projects={projectsForBrief ?? []}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
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
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--faint)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Brief
      </div>
      <select
        value={activeBriefId ?? ""}
        onChange={(e) => onSwitchBrief && onSwitchBrief(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 0,
          border: "1px solid var(--line)",
          background: "var(--ink-soft)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
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
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--faint)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        History
      </div>
      <select
        value={selectedProjectId ?? ""}
        onChange={(e) => onSelectProject(e.target.value || null)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 0,
          border: "1px solid var(--line)",
          background: "var(--ink-soft)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
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
  return (
    <div style={{ color: "var(--text)" }}>
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            lineHeight: 1.3,
            color: "var(--accent)",
          }}
        >
          {brief?.topic ?? project?.slug ?? "未命名节目"}
        </h3>
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--mute)",
            letterSpacing: "0.15em",
          }}
        >
          {brief?.type ?? "theme-show"} · {brief?.status ?? project?.status ?? "draft"}
        </p>
      </div>

      {showPlan ? (
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--faint)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {showPlan.blocks?.length ?? 0} blocks
          </div>
          {showPlan.blocks?.map((block, idx) => (
            <BlockView key={idx} block={block} idx={idx} />
          ))}
          {onGenerateNow && (
            <button
              onClick={onGenerateNow}
              disabled={isGeneratingNow || isExporting || isDeleting}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 0,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--bg)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                cursor: (isGeneratingNow || isExporting || isDeleting) ? "not-allowed" : "pointer",
                opacity: (isGeneratingNow || isExporting || isDeleting) ? 0.6 : 1,
                marginTop: 12,
              }}
            >
              {isGeneratingNow ? "Generating..." : "Generate Now"}
            </button>
          )}
        </div>
      ) : (
        <p
          style={{
            color: "var(--faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            fontStyle: "italic",
          }}
        >
          No ShowPlan
        </p>
      )}

      {jobs && jobs.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--faint)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Jobs ({jobs.length})
          </div>
          {jobs.map((job, idx) => (
            <JobView key={idx} job={job} />
          ))}
        </div>
      )}

      {project && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--faint)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Export
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
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text)",
                    letterSpacing: "0.08em",
                  }}
                >
                  Include trace
                </span>
              </label>

              <button
                onClick={onExport}
                disabled={isExporting || isDeleting}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 0,
                  border: "1px solid var(--accent)",
                  background: "var(--ink-soft)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: (isExporting || isDeleting) ? "not-allowed" : "pointer",
                  opacity: (isExporting || isDeleting) ? 0.6 : 1,
                  marginBottom: 8,
                }}
              >
                {isExporting ? "Exporting…" : "Export"}
              </button>
            </>
          )}

          {exportError && (
            <p
              style={{
                marginTop: 8,
                margin: "8px 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                letterSpacing: "0.08em",
              }}
            >
              {exportError}
            </p>
          )}

          {exportResult && project && exportResult.projectId === project.id && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "#4ade80",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
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
                      padding: "6px 10px",
                      borderRadius: 0,
                      border: "1px solid var(--text)",
                      background: "transparent",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
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

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--faint)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Manage
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onDeleteTrace && project.productionTracePath && (
                <button
                  onClick={onDeleteTrace}
                  disabled={isDeleting || isExporting}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--line)",
                    background: "transparent",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
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
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--faint)",
                    background: "transparent",
                    color: "var(--faint)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    cursor: (isDeleting || isExporting) ? "not-allowed" : "pointer",
                    opacity: (isDeleting || isExporting) ? 0.5 : 1,
                  }}
                >
                  Del Project
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
        background: "var(--ink-soft)",
        borderRadius: 0,
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--faint)",
            letterSpacing: "0.08em",
          }}
        >
          #{idx + 1}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "2px 6px",
            background: "var(--ink-soft)",
            color: "var(--accent)",
            borderRadius: 0,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          {block.role ?? "segment"}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          lineHeight: 1.3,
          marginBottom: 4,
        }}
      >
        {block.title ?? "未命名段落"}
      </div>
      {block.storyGoal && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--mute)",
            letterSpacing: "0.08em",
          }}
        >
          {block.storyGoal}
        </p>
      )}
      {block.episodes && block.episodes.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--faint)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
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
        background: "var(--ink-soft)",
        borderRadius: 0,
        fontSize: 10,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--faint)",
          fontSize: 9,
          letterSpacing: "0.08em",
        }}
      >
        {episode.status === "completed" ? "OK" : episode.status === "generating" ? ".." : "--"}
      </span>
      <span style={{ color: "var(--text)", flex: 1 }}>
        {episode.track?.title ?? episode.title ?? "未命名"}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--faint)",
          fontSize: 9,
          letterSpacing: "0.08em",
        }}
      >
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
        background: "var(--ink-soft)",
        borderRadius: 0,
        fontSize: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text)",
          letterSpacing: "0.08em",
        }}
      >
        {job.type ?? "job"}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          padding: "2px 6px",
          borderRadius: 0,
          fontSize: 9,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          background: "var(--ink-soft)",
          color: "var(--accent)",
        }}
      >
        {job.status ?? "pending"}
      </span>
    </div>
  );
}

function EmptyState() {
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
        暂无制作项目
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
        在聊天中告诉 DJ 你的制作意图
      </p>
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
