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
import { PANEL_LABEL, FIELD_DESC, pillButton } from "./panel-ui";

export type LibraryViewProps = {
  brief?: ProgramBrief | null;
  briefs?: ProgramBrief[];
  showPlan?: ShowPlan | null;
  jobs?: ShowJob[];
  projects?: ShowProject[];
  onSwitchBrief?: (briefId: string) => void | Promise<void>;
  onProjectsChanged?: () => void;
  onGenerateNow?: (briefId: string) => void | Promise<void>;
};

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
      <div style={{ ...PANEL_LABEL, marginBottom: 12 }}>TODAY&apos;S SHOW · 今日电台</div>
      <div style={{ ...FIELD_DESC, fontSize: 10.5, marginBottom: 14 }}>
        把今天播放过的节目按顺序串成一期可发布的素材（show.mp3 + show notes）。
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleExportToday}
          disabled={isExportingToday}
          style={{
            ...pillButton("ghost"),
            cursor: isExportingToday ? "wait" : "pointer",
            opacity: isExportingToday ? 0.6 : 1,
          }}
        >
          {isExportingToday ? "EXPORTING…" : "EXPORT TODAY"}
        </button>
        {todayTask?.status === "completed" && todayTask.result && (
          <a
            href={buildApiUrl(todayTask.result.downloadUrl)}
            download
            style={{ ...pillButton("primary"), textDecoration: "none" }}
          >
            DOWNLOAD ZIP
          </a>
        )}
      </div>
      {isExportingToday && todayTask?.progress && (
        <div style={{ ...FIELD_DESC, fontSize: 10.5, marginBottom: 12 }}>
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
        <div style={{ ...FIELD_DESC, fontSize: 10.5, color: "#4ade80", marginBottom: 12 }}>
          导出完成 · {todayTask.result.trackCount} 首 · {todayTask.result.date}
        </div>
      )}
      {todayTask?.status === "failed" && (
        <div style={{ ...FIELD_DESC, fontSize: 10.5, color: "var(--danger)", marginBottom: 12 }}>
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
    return <div style={{ ...PANEL_LABEL, letterSpacing: "0.15em" }}>LOADING…</div>;
  }

  return (
    <div>
      <div style={{ ...PANEL_LABEL, marginBottom: 4 }}>DAILY SCHEDULE · {date}</div>
      {blocks.length === 0 ? (
        <div style={{ ...FIELD_DESC, fontSize: 11, fontStyle: "italic", marginTop: 10 }}>暂无节目安排</div>
      ) : (
        <div>
          {blocks.map((b, i) => {
            const pw = prewarmBlocks.find((p) => p.at === b.at);
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr auto",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "13px 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
                  {b.at}
                </span>
                <div style={{ fontFamily: "var(--font-courier)", fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{b.label}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={PANEL_LABEL}>{b.moodHint}</span>
                  {pw && (
                    <span style={{ ...PANEL_LABEL, fontSize: 8, color: pw.ready > 0 ? "var(--ink)" : "var(--faint)" }}>
                      {pw.ready}R · {pw.consumed}C{pw.failed > 0 ? ` · ${pw.failed}F` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
}: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("production");

  const tabs: Array<{ key: LibraryTab; label: string; count?: number }> = [
    { key: "production", label: "制作" },
    { key: "library", label: "节目库", count: projects?.length ?? 0 },
    { key: "today", label: "今日" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab 分段控件：与顶栏 DARK/LIGHT 同一交互语言 */}
      <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--seg-line)", borderRadius: 18, padding: 3, gap: 2 }}>
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "1.5px",
                border: "none",
                borderRadius: 14,
                padding: "6px 9px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                ...(active
                  ? { background: "var(--seg-bg)", color: "var(--ink)", fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,.15)" }
                  : { background: "transparent", color: "var(--muted)", fontWeight: 500 }),
              }}
            >
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span style={{ fontSize: 8.5, letterSpacing: "0.1em", color: active ? "var(--ink)" : "var(--faint)" }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      {activeTab === "production" && (
        <ProductionBoard
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
        <ShowLibrary projects={projects ?? []} onRefresh={onProjectsChanged ?? (() => {})} />
      )}

      {activeTab === "today" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <TodayExportSection />
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <ScheduleSection />
          </div>
        </div>
      )}
    </div>
  );
}
