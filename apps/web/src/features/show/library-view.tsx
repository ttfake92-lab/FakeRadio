"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ProgramBrief, ShowPlan, ShowJob, ShowProject } from "@fakeradio/shared";
import {
  exportTodayShow,
  getExportTodayStatus,
  buildApiUrl,
  getTodayPlan,
  getPrewarmStatus,
  type TodayExportTask
} from "../../lib/api-client";
import { ProductionBoard } from "./production-board";
import { ShowLibrary } from "./show-library";

export type LibraryViewProps = {
  brief?: ProgramBrief | null;
  briefs?: ProgramBrief[];
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  projects?: ShowProject[];
  onSwitchBrief?: (briefId: string) => void | Promise<void>;
  onProjectsChanged?: () => void;
  onGenerateNow?: (briefId: string) => void | Promise<void>;
  onClose: () => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.28em",
        color: "var(--mute)",
        textTransform: "uppercase",
        marginBottom: 16,
        marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TodayExportSection — 今日整期打包（搬迁自原 ExportView）
// ─────────────────────────────────────────────────────────────
function TodayExportSection() {
  const [todayTask, setTodayTask] = useState<TodayExportTask | null>(null);
  const [todayStarting, setTodayStarting] = useState(false);
  const todayPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (todayPollRef.current) clearInterval(todayPollRef.current);
    };
  }, []);

  const handleExportToday = useCallback(async () => {
    if (todayPollRef.current) {
      clearInterval(todayPollRef.current);
      todayPollRef.current = null;
    }
    setTodayStarting(true);
    setTodayTask(null);
    try {
      const { taskId } = await exportTodayShow();
      const poll = async () => {
        try {
          const task = await getExportTodayStatus(taskId);
          setTodayTask(task);
          if (task.status === "completed" || task.status === "failed") {
            if (todayPollRef.current) {
              clearInterval(todayPollRef.current);
              todayPollRef.current = null;
            }
          }
        } catch { /* 网络抖动时继续轮询 */ }
      };
      await poll();
      todayPollRef.current = setInterval(poll, 1500);
    } catch (e) {
      setTodayTask({ status: "failed", error: e instanceof Error ? e.message : "导出失败" });
    } finally {
      setTodayStarting(false);
    }
  }, []);

  const isExportingToday =
    todayStarting || todayTask?.status === "pending" || todayTask?.status === "running";

  return (
    <div>
      <SectionTitle>TODAY&apos;S SHOW · 今日电台</SectionTitle>
      <div style={{ fontSize: 12, color: "var(--mute)", lineHeight: 1.6, marginBottom: 16 }}>
        把今天播放过的节目按顺序串成一期可发布的素材（show.mp3 + show notes）。
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleExportToday}
          disabled={isExportingToday}
          style={{
            padding: "8px 20px",
            border: "1px solid var(--line)",
            borderRadius: 999,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.15em",
            color: "var(--text)",
            cursor: isExportingToday ? "wait" : "pointer",
            background: "transparent",
          }}
        >
          {isExportingToday ? "EXPORTING…" : "EXPORT TODAY"}
        </button>
        {todayTask?.status === "completed" && todayTask.result && (
          <a
            href={buildApiUrl(todayTask.result.downloadUrl)}
            download
            style={{
              padding: "8px 20px",
              border: "1px solid var(--text)",
              borderRadius: 999,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.15em",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            DOWNLOAD ZIP
          </a>
        )}
      </div>
      {isExportingToday && todayTask?.progress && (
        <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>
          {(() => {
            const p = todayTask.progress;
            const labels: Record<string, string> = {
              collecting: "收集当日曲目…",
              mixing: "处理音频",
              concatenating: "拼接节目音频…",
              notes: "生成 show notes…",
              packaging: "打包 ZIP…",
              done: "完成",
            };
            const base = labels[p.phase] ?? p.phase;
            return p.phase === "mixing" && p.current && p.total
              ? `${base} ${p.current}/${p.total}${p.trackTitle ? ` · ${p.trackTitle}` : ""}`
              : base;
          })()}
        </div>
      )}
      {todayTask?.status === "completed" && todayTask.result && (
        <div style={{ fontSize: 12, color: "#4ade80", marginBottom: 12 }}>
          导出完成 · {todayTask.result.trackCount} 首 · {todayTask.result.date}
        </div>
      )}
      {todayTask?.status === "failed" && (
        <div style={{ fontSize: 12, color: "#c44", marginBottom: 12 }}>
          {todayTask.error ?? "导出失败"}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ScheduleSection — 今日节目单（搬迁自原 ScheduleView，只读）
// ─────────────────────────────────────────────────────────────
function ScheduleSection() {
  const [blocks, setBlocks] = useState<Array<{ at: string; label: string; moodHint: string }>>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [prewarmBlocks, setPrewarmBlocks] = useState<Array<{ at: string; ready: number; consumed: number; failed: number }>>([]);

  useEffect(() => {
    getTodayPlan()
      .then((data) => {
        setBlocks(data.blocks);
        setDate(data.date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    getPrewarmStatus()
      .then((data) => setPrewarmBlocks(data.blocks ?? []))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div style={{ fontSize: 10, color: "var(--mute)", fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
        LOADING…
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>DAILY SCHEDULE &nbsp;·&nbsp; {date}</SectionTitle>
      {blocks.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>暂无节目安排</div>
      ) : (
        <div>
          {blocks.map((b, i) => {
            const pw = prewarmBlocks.find((p) => p.at === b.at);
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr auto",
                  alignItems: "baseline",
                  gap: 16,
                  padding: "16px 0",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--mute)", letterSpacing: "0.08em" }}>
                  {b.at}
                </span>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1.3 }}>{b.label}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--faint)", textTransform: "uppercase" }}>
                    {b.moodHint}
                  </span>
                  {pw && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: pw.ready > 0 ? "var(--text)" : "var(--faint)" }}>
                      {pw.ready}R · {pw.consumed}C{pw.failed > 0 ? ` · ${pw.failed}F` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid var(--line)" }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LibraryView — 节目库统一视图(Tab 切换: 制作 / 节目库 / 今日 & 节目单)
// ─────────────────────────────────────────────────────────────
type LibraryTab = "production" | "library" | "today";

export function LibraryView({
  brief,
  briefs,
  showPlan,
  jobs,
  projects,
  onSwitchBrief,
  onProjectsChanged,
  onGenerateNow,
  onClose,
}: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("production");

  const tabs: Array<{ key: LibraryTab; label: string; sub: string; count?: number }> = [
    { key: "production", label: "Production", sub: "制作工作台" },
    { key: "library", label: "Library", sub: "节目库", count: projects?.length ?? 0 },
    { key: "today", label: "Today", sub: "今日整期 + 节目单" },
  ];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "min(820px, 100%)",
        margin: "0 auto",
        padding: "32px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Tab Header */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          borderBottom: "1px solid var(--line)",
        }}
      >
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                padding: "16px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
                marginBottom: -1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                color: active ? "var(--text)" : "var(--mute)",
                transition: "color 0.18s ease",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    fontStyle: "italic",
                    lineHeight: 1,
                  }}
                >
                  {t.label}
                </span>
                {typeof t.count === "number" && t.count > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.15em",
                      color: "var(--accent)",
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--faint)",
                }}
              >
                {t.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      {activeTab === "production" && (
        <ProductionBoard
          isExpanded
          embedded
          onToggleExpand={() => {}}
          onClose={onClose}
          {...(brief !== undefined ? { brief } : {})}
          {...(briefs !== undefined ? { briefs } : {})}
          {...(showPlan !== undefined ? { showPlan } : {})}
          {...(jobs !== undefined ? { jobs } : {})}
          {...(projects !== undefined ? { projects } : {})}
          {...(onSwitchBrief !== undefined ? { onSwitchBrief } : {})}
          {...(onProjectsChanged !== undefined ? { onProjectsChanged } : {})}
          {...(onGenerateNow !== undefined ? { onGenerateNow } : {})}
        />
      )}

      {activeTab === "library" && (
        <ShowLibrary
          isExpanded
          isOpen
          embedded
          projects={projects ?? []}
          onToggleExpand={() => {}}
          onClose={onClose}
          onRefresh={onProjectsChanged ?? (() => {})}
        />
      )}

      {activeTab === "today" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <TodayExportSection />
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 32 }}>
            <ScheduleSection />
          </div>
        </div>
      )}
    </div>
  );
}
