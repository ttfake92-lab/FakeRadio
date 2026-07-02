"use client";

import React, { useState } from "react";

// ─────────────────────────────────────────────────────────────
// panel-ui — 节目库/设置等覆盖层面板的统一设计语言（frontend 4.0）
// 折叠面板与 QUEUE 栏同一交互：uppercase 小字标题 + 旋转 chevron。
// ─────────────────────────────────────────────────────────────

/** 小节标题 / 元信息标签 */
export const PANEL_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "2px",
  color: "var(--muted)",
  textTransform: "uppercase",
};

/** 表单项标签 */
export const FIELD_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.08em",
  color: "var(--ink)",
};

/** 表单项说明文字 */
export const FIELD_DESC: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.05em",
  color: "var(--muted)",
  lineHeight: 1.5,
};

/** 输入框 / 下拉框 */
export const FIELD_INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--bubble)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
};

/** 胶囊按钮：primary 实底，ghost 描边，danger 弱化删除 */
export function pillButton(variant: "primary" | "ghost" | "danger" = "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "7px 16px",
    borderRadius: 999,
    fontFamily: "var(--font-mono)",
    fontSize: 9.5,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    cursor: "pointer",
  };
  if (variant === "primary") {
    return { ...base, border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--bg)" };
  }
  if (variant === "danger") {
    return { ...base, border: "1px solid var(--line)", background: "transparent", color: "var(--danger)" };
  }
  return { ...base, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)" };
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s ease", flex: "none" }}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 可折叠分区。默认自管开合；传入 open + onToggle 则为受控模式。
 * 交互样式与主屏 QUEUE 栏一致。
 */
export function CollapsibleSection({
  title,
  extra,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  /** 标题行右侧、chevron 左边的附加内容（计数/状态） */
  extra?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const toggle = onToggle ?? (() => setUncontrolledOpen((v) => !v));

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: "100%",
          padding: "12px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "2.5px",
          textTransform: "uppercase",
          color: "var(--ink)",
          textAlign: "left",
        }}
      >
        <span>{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
          {extra}
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div style={{ padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}
