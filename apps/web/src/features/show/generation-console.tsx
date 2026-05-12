"use client";

import { useEffect, useRef, useState } from "react";

export type GenerationLogEntry = {
  timestamp: number;
  level: "info" | "warn" | "error" | "trace";
  phase?: string;
  message: string;
  details?: string;
};

export type GenerationConsoleProps = {
  isExpanded: boolean;
  isOpen: boolean;
  logs: GenerationLogEntry[];
  currentPhase?: string;
  onToggleExpand: () => void;
  onClose: () => void;
  onPause?: () => void;
  onCancel?: () => void;
  onAddConstraint?: () => void;
  isGenerating?: boolean;
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
  isGenerating = false,
}: GenerationConsoleProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isExpanded]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 16,
        width: isExpanded ? 600 : 280,
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
        isGenerating={isGenerating}
        {...(currentPhase !== undefined && { currentPhase })}
        onToggleExpand={onToggleExpand}
        onClose={onClose}
      />

      {isExpanded && (
        <ConsoleContent
          logs={logs}
          {...(currentPhase !== undefined && { currentPhase })}
          {...(onPause !== undefined && { onPause })}
          {...(onCancel !== undefined && { onCancel })}
          {...(onAddConstraint !== undefined && { onAddConstraint })}
          isGenerating={isGenerating}
          logsEndRef={logsEndRef}
        />
      )}
    </div>
  );
}

function ConsoleHeader({
  isExpanded,
  isGenerating,
  currentPhase,
  onToggleExpand,
  onClose,
}: {
  isExpanded: boolean;
  isGenerating: boolean;
  currentPhase?: string;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
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
        {isGenerating && (
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
        {currentPhase && !isExpanded && (
          <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.5)" }}>
            {currentPhase}
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
  );
}

function ConsoleContent({
  logs,
  currentPhase,
  onPause,
  onCancel,
  onAddConstraint,
  isGenerating,
  logsEndRef,
}: {
  logs: GenerationLogEntry[];
  currentPhase?: string;
  onPause?: () => void;
  onCancel?: () => void;
  onAddConstraint?: () => void;
  isGenerating: boolean;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
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
        {isGenerating && (
          <>
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
          </>
        )}
        {onAddConstraint && (
          <button
            onClick={onAddConstraint}
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
