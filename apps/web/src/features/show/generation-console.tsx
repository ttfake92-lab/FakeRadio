"use client";

import { useEffect, useRef, useState } from "react";
import { ConstraintDialog } from "./constraint-dialog";

export type GenerationLogEntry = {
  timestamp: number;
  level: "info" | "warn" | "error" | "trace";
  phase?: string;
  message: string;
  details?: string;
};

export type ShowPlanBlockConstraints = {
  preferEra?: string;
  avoidExplicit?: boolean;
  moodHint?: string;
};

export type GenerationConsoleProps = {
  isExpanded: boolean;
  isOpen: boolean;
  logs: GenerationLogEntry[];
  currentPhase?: string;
  onToggleExpand: () => void;
  onClose: () => void;
  onPause?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onAddConstraint?: ((constraints: ShowPlanBlockConstraints) => void) | undefined;
  onResume?: (() => void) | undefined;
  isGenerating?: boolean;
  jobStatus?: "pending" | "running" | "paused" | "needs-replan" | "cancelled" | "failed" | "completed" | undefined;
};

export function GenerationConsole({
  isExpanded,
  isOpen,
  logs,
  currentPhase,
  onToggleExpand,
  onClose,
  onPause,
  onCancel,
  onAddConstraint,
  onResume,
  isGenerating = false,
  jobStatus,
}: GenerationConsoleProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isConstraintDialogOpen, setIsConstraintDialogOpen] = useState(false);

  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isExpanded]);

  const handleConstraintSubmit = (constraints: ShowPlanBlockConstraints) => {
    if (onAddConstraint) {
      onAddConstraint(constraints);
    }
    setIsConstraintDialogOpen(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <ConstraintDialog
        isOpen={isConstraintDialogOpen}
        onClose={() => setIsConstraintDialogOpen(false)}
        onSubmit={handleConstraintSubmit}
      />
      <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 16,
        width: isExpanded ? "min(600px, calc(100vw - 32px))" : "min(280px, calc(100vw - 32px))",
        maxHeight: isExpanded ? "calc(100vh - 160px)" : "auto",
        background: "rgba(10, 10, 10, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "width 0.2s ease",
        zIndex: 100,
        backdropFilter: "blur(12px)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      <ConsoleHeader
        isExpanded={isExpanded}
        jobStatus={jobStatus ?? undefined}
        onToggleExpand={onToggleExpand}
        onClose={onClose}
      />

      {isExpanded && (
        <ConsoleContent
          logs={logs}
          currentPhase={currentPhase}
          jobStatus={jobStatus ?? undefined}
          onPause={jobStatus === "running" ? onPause : undefined}
          onResume={jobStatus === "paused" || jobStatus === "needs-replan" ? onResume : undefined}
          onCancel={jobStatus && ["pending", "running", "paused", "needs-replan"].includes(jobStatus) ? onCancel : undefined}
          onOpenConstraintDialog={jobStatus === "running" ? () => setIsConstraintDialogOpen(true) : undefined}
          isGenerating={isGenerating}
          logsEndRef={logsEndRef}
        />
      )}
    </div>
    </>
  );
}

function ConsoleHeader({
  isExpanded,
  jobStatus,
  onToggleExpand,
  onClose,
}: {
  isExpanded: boolean;
  jobStatus?: string | undefined;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
  const isActive = jobStatus && ["pending", "running", "paused", "needs-replan"].includes(jobStatus ?? "");

  return (
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
        <span style={{ fontSize: 16 }}>⚡</span>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
          {isExpanded ? "Generation Console" : "生成控制台"}
        </span>
        {isActive && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4ade80",
              animation: "pulse 1.5s infinite",
            }}
          />
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
  );
}

function ConsoleContent({
  logs,
  currentPhase,
  onPause,
  onResume,
  onCancel,
  onOpenConstraintDialog,
  isGenerating,
  logsEndRef,
  jobStatus,
}: {
  logs: GenerationLogEntry[];
  currentPhase?: string | undefined;
  onPause?: (() => void) | undefined;
  onResume?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onOpenConstraintDialog?: (() => void) | undefined;
  isGenerating: boolean;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  jobStatus?: string | undefined;
}) {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Always show control buttons if available, not just when isGenerating is true */}
        {onPause && (
          <button
            onClick={onPause}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "transparent",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            暂停
          </button>
        )}
        {onResume && (
          <button
            onClick={onResume}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid rgba(74, 222, 128, 0.3)",
              background: "rgba(74, 222, 128, 0.1)",
              color: "#4ade80",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            恢复
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid rgba(248, 113, 113, 0.3)",
              background: "rgba(248, 113, 113, 0.1)",
              color: "#f87171",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            取消
          </button>
        )}
        {onOpenConstraintDialog && (
          <button
            onClick={onOpenConstraintDialog}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid rgba(232, 160, 74, 0.3)",
              background: "rgba(232, 160, 74, 0.1)",
              color: "#e8a04a",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            + 追加约束
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight: "calc(100vh - 380px)",
          overflowY: "auto",
          padding: "12px 16px",
        }}
      >
        {logs.length === 0 ? (
          <p style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 12, textAlign: "center" }}>
            暂无生成日志
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255, 255, 255, 0.4)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>制作台日志</span>
                <span style={{ color: "rgba(255, 255, 255, 0.2)" }}>|</span>
                <button
                  onClick={() => setShowTrace(!showTrace)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: showTrace ? "#60a5fa" : "rgba(255, 255, 255, 0.4)",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0,
                  }}
                >
                  {showTrace ? "隐藏" : "显示"}技术 trace
                </button>
              </div>
              <LogStream logs={logs.filter((l) => l.level !== "trace")} />
            </div>

            {showTrace && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", marginBottom: 8 }}>
                  技术 trace
                </div>
                <LogStream logs={logs.filter((l) => l.level === "trace")} />
              </div>
            )}
          </>
        )}
        <div ref={logsEndRef} />
      </div>
    </>
  );
}

function LogStream({ logs }: { logs: GenerationLogEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {logs.map((log, idx) => (
        <LogEntry key={idx} log={log} />
      ))}
    </div>
  );
}

function LogEntry({ log }: { log: GenerationLogEntry }) {
  const color = getLogColor(log.level);
  const time = new Date(log.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 12,
        lineHeight: 1.5,
        padding: "4px 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
      }}
    >
      <span style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 10, minWidth: 60 }}>
        {time}
      </span>
      {log.phase && (
        <span
          style={{
            padding: "1px 6px",
            background: "rgba(96, 165, 250, 0.1)",
            color: "#60a5fa",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {log.phase}
        </span>
      )}
      <span style={{ color, flex: 1 }}>{log.message}</span>
    </div>
  );
}

function getLogColor(level: string): string {
  switch (level) {
    case "error": return "#f87171";
    case "warn": return "#fbbf24";
    case "info": return "#e5e7eb";
    case "trace": return "#9ca3af";
    default: return "#e5e7eb";
  }
}
