"use client";

import { useCallback, useMemo } from "react";
import type { ProductionLog, ProgramBrief, ShowJob, ShowPlan, ShowProject } from "@fakeradio/shared";
import type { OnAirThemeId } from "../player/player-view-model";
import type { Persona } from "../player/skin-config";
import { PERSONAS } from "../player/skin-config";
import { useProductionPanels, type PanelId } from "./use-production-panels";
import { ProductionBoard } from "./production-board";
import { GenerationConsole, type GenerationLogEntry } from "./generation-console";
import { ExportQueue, type ExportTask } from "./export-queue";
import { SettingsPanel } from "./settings-panel";
import { ShowLibrary } from "./show-library";
import type { ShowPlanBlockConstraints } from "../../lib/api-client";

export type ProductionShellProps = {
  // Production data
  productionBriefs: ProgramBrief[];
  activeBriefId: string | null;
  productionPlans: ShowPlan[];
  productionJobs: ShowJob[];
  productionProjects: ShowProject[];
  generationLogs: ProductionLog[];
  activeBrief: ProgramBrief | null;
  activePlan: ShowPlan | null;
  activeJob: ShowJob | null;
  isGenerating: boolean;
  // Callbacks
  onSwitchBrief: ((briefId: string) => void | Promise<void> | undefined) | undefined;
  onPauseJob: (() => void) | undefined;
  onResumeJob: (() => void) | undefined;
  onCancelJob: (() => void) | undefined;
  onAddConstraint: ((constraints: ShowPlanBlockConstraints) => void) | undefined;
  onProjectsChanged: (() => void) | undefined;
  // Error
  error: string | null | undefined;
  // Personalization
  theme: OnAirThemeId;
  selectedPersona: Persona;
  avatarSrc: string | null;
  showSettings: boolean | undefined;
  onThemeChange: (theme: OnAirThemeId) => void;
  onPersonaChange: (persona: Persona) => void;
  onAvatarUpload: (file: File) => void;
  onAvatarRemove: () => void;
  onAvatarClick: () => void;
};

export function ProductionShell({
  productionBriefs,
  activeBriefId,
  productionPlans,
  productionJobs,
  productionProjects,
  generationLogs,
  activeBrief,
  activePlan,
  activeJob,
  isGenerating,
  onSwitchBrief,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onAddConstraint,
  onProjectsChanged,
  error,
  theme,
  selectedPersona,
  avatarSrc,
  showSettings,
  onThemeChange,
  onPersonaChange,
  onAvatarUpload,
  onAvatarRemove,
  onAvatarClick,
}: ProductionShellProps) {
  const { panels, togglePanel } = useProductionPanels();

  const handlePanelToggle = useCallback(
    (panelId: PanelId) => {
      togglePanel(panelId);
    },
    [togglePanel],
  );

  const exportTasks: ExportTask[] = useMemo(() => {
    if (!activeBrief) return [];
    const jobsForBrief = productionJobs.filter((j) => j.briefId === activeBrief.id);
    const projectsForBrief = productionProjects.filter((p) => p.briefId === activeBrief.id);

    return jobsForBrief
      .map((job) => {
        let project = projectsForBrief.find((p) => p.activeJobId === job.id);
        if (!project) {
          project = projectsForBrief.find((p) => p.briefId === job.briefId);
        }
        if (!project) {
          return null;
        }
        const task: ExportTask = {
          id: job.id,
          projectId: project.id,
          status:
            job.status === "completed"
              ? "completed"
              : job.status === "failed"
                ? "failed"
                : job.status === "running"
                  ? "running"
                  : "pending",
          createdAt: new Date(job.createdAt).getTime(),
        };
        if (job.completedAt) {
          task.completedAt = new Date(job.completedAt).getTime();
        }
        if (job.error) {
          task.error = job.error;
        }
        return task;
      })
      .filter((task): task is ExportTask => task !== null);
  }, [activeBrief, productionJobs, productionProjects]);

  return (
    <>
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            padding: "10px 16px",
            background: "rgba(200, 0, 0, 0.92)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 13,
            maxWidth: "80vw",
            textAlign: "center",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {error}
        </div>
      )}

      <ProductionToolbar
        panels={panels}
        onToggle={handlePanelToggle}
        onAvatarClick={onAvatarClick}
      />

      <ProductionBoard
        brief={activeBrief}
        briefs={productionBriefs}
        showPlan={activePlan}
        jobs={productionJobs}
        projects={productionProjects}
        isExpanded={panels.productionBoard.isExpanded}
        onToggleExpand={() => handlePanelToggle("productionBoard")}
        onClose={() => panels.productionBoard.isOpen && handlePanelToggle("productionBoard")}
        onSwitchBrief={onSwitchBrief}
        onExportStart={() => handlePanelToggle("exportQueue")}
        onProjectsChanged={onProjectsChanged}
      />

      <GenerationConsole
        logs={generationLogs.map((l) => ({
          timestamp: new Date(l.timestamp).getTime(),
          level: l.level as "info" | "warn" | "error" | "trace",
          message: l.message,
          ...(l.phase !== undefined ? { phase: l.phase } : {}),
        })) as GenerationLogEntry[]}
        currentPhase={isGenerating ? "generating" : ""}
        isExpanded={panels.generationConsole.isExpanded}
        isOpen={panels.generationConsole.isOpen}
        isGenerating={activeJob?.status === "running"}
        jobStatus={activeJob?.status}
        onToggleExpand={() => handlePanelToggle("generationConsole")}
        onClose={() => panels.generationConsole.isOpen && handlePanelToggle("generationConsole")}
        onPause={onPauseJob}
        onResume={onResumeJob}
        onCancel={onCancelJob}
        onAddConstraint={onAddConstraint}
      />

      <ExportQueue
        tasks={exportTasks}
        isExpanded={panels.exportQueue.isExpanded}
        isOpen={panels.exportQueue.isOpen}
        onToggleExpand={() => handlePanelToggle("exportQueue")}
        onClose={() => panels.exportQueue.isOpen && handlePanelToggle("exportQueue")}
      />

      <SettingsPanel
        isExpanded={panels.settings.isExpanded}
        isOpen={panels.settings.isOpen}
        onToggleExpand={() => handlePanelToggle("settings")}
        onClose={() => panels.settings.isOpen && handlePanelToggle("settings")}
      />

      <ShowLibrary
        projects={productionProjects}
        isExpanded={panels.showLibrary.isExpanded}
        isOpen={panels.showLibrary.isOpen}
        onToggleExpand={() => handlePanelToggle("showLibrary")}
        onClose={() => panels.showLibrary.isOpen && handlePanelToggle("showLibrary")}
        onRefresh={onProjectsChanged || (() => {})}
      />

      {showSettings && (
        <PersonalizationPanel
          theme={theme}
          selectedPersona={selectedPersona}
          avatarSrc={avatarSrc}
          onThemeChange={onThemeChange}
          onPersonaChange={onPersonaChange}
          onAvatarUpload={onAvatarUpload}
          onAvatarRemove={onAvatarRemove}
          onClose={onAvatarClick}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Internal sub-components                                           */
/* ------------------------------------------------------------------ */

function ProductionToolbar({
  panels,
  onToggle,
  onAvatarClick,
}: {
  panels: ReturnType<typeof useProductionPanels>["panels"];
  onToggle: (id: PanelId) => void;
  onAvatarClick: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        gap: 6,
        zIndex: 90,
      }}
    >
      <ToolbarButton
        label="📻"
        title="制作台"
        isActive={panels.productionBoard.isOpen}
        onClick={() => onToggle("productionBoard")}
      />
      <ToolbarButton
        label="⚡"
        title="生成控制台"
        isActive={panels.generationConsole.isOpen}
        onClick={() => onToggle("generationConsole")}
      />
      <ToolbarButton
        label="📦"
        title="导出队列"
        isActive={panels.exportQueue.isOpen}
        onClick={() => onToggle("exportQueue")}
      />
      <ToolbarButton
        label="⚙️"
        title="设置"
        isActive={panels.settings.isOpen}
        onClick={() => onToggle("settings")}
      />
      <ToolbarButton
        label="📚"
        title="历史节目库"
        isActive={panels.showLibrary.isOpen}
        onClick={() => onToggle("showLibrary")}
      />
      <ToolbarButton
        label="👤"
        title="主题和头像"
        isActive={false}
        onClick={onAvatarClick}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  title,
  isActive,
  onClick,
}: {
  label: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: isActive
          ? "1px solid rgba(232, 160, 74, 0.5)"
          : "1px solid rgba(255, 255, 255, 0.1)",
        background: isActive ? "rgba(232, 160, 74, 0.2)" : "rgba(0, 0, 0, 0.7)",
        color: "#fff",
        fontSize: 16,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function PersonalizationPanel({
  theme,
  selectedPersona,
  avatarSrc,
  onThemeChange,
  onPersonaChange,
  onAvatarUpload,
  onAvatarRemove,
  onClose,
}: {
  theme: OnAirThemeId;
  selectedPersona: Persona;
  avatarSrc: string | null;
  onThemeChange: (t: OnAirThemeId) => void;
  onPersonaChange: (p: Persona) => void;
  onAvatarUpload: (f: File) => void;
  onAvatarRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 24,
          width: 320,
          maxHeight: "80vh",
          overflowY: "auto",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Personalization
        </h3>

        {/* Theme — single theme only */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            THEME
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: 12,
              display: "inline-block",
            }}
          >
            Amber
          </div>
        </div>

        {/* Persona selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            DJ PERSONA
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.values(PERSONAS) as Persona[]).map((p) => (
              <button
                key={p.short}
                onClick={() => onPersonaChange(p)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border:
                    selectedPersona.short === p.short
                      ? "2px solid #e8a04a"
                      : "1px solid rgba(255,255,255,0.1)",
                  background:
                    selectedPersona.short === p.short
                      ? "rgba(232,160,74,0.15)"
                      : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                  {p.short} · {p.tag.split(" · ")[1] ?? p.tag}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Avatar */}
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            DJ AVATAR
          </div>
          {avatarSrc ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={avatarSrc}
                alt="avatar"
                style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
              />
              <button
                onClick={onAvatarRemove}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "block",
                padding: "12px",
                borderRadius: 8,
                border: "1px dashed rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 12,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              Click to upload photo
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAvatarUpload(f);
                }}
              />
            </label>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: "#e8a04a",
            color: "#000",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
