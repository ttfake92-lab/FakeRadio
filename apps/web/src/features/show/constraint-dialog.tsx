"use client";

import { useState } from "react";
import type { ShowPlanBlockConstraints } from "../../lib/api-client";

export type ConstraintDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (constraints: ShowPlanBlockConstraints) => void;
};

export function ConstraintDialog({
  isOpen,
  onClose,
  onSubmit,
}: ConstraintDialogProps) {
  const [preferEra, setPreferEra] = useState("");
  const [moodHint, setMoodHint] = useState("");
  const [avoidExplicit, setAvoidExplicit] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const constraints: ShowPlanBlockConstraints = {};
    if (preferEra) constraints.preferEra = preferEra;
    if (moodHint) constraints.moodHint = moodHint;
    if (avoidExplicit) constraints.avoidExplicit = true;
    onSubmit(constraints);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(20, 20, 20, 0.98)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 12,
          padding: 24,
          width: 320,
          maxWidth: "90vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#fff", margin: "0 0 16px 0", fontSize: 16 }}>
          追加约束
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, display: "block", marginBottom: 4 }}>
              偏好年代
            </label>
            <input
              type="text"
              value={preferEra}
              onChange={(e) => setPreferEra(e.target.value)}
              placeholder="例如: 1970s, 1980s"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, display: "block", marginBottom: 4 }}>
              氛围提示
            </label>
            <input
              type="text"
              value={moodHint}
              onChange={(e) => setMoodHint(e.target.value)}
              placeholder="例如: nostalgic, energetic, mellow"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={avoidExplicit}
                onChange={(e) => setAvoidExplicit(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>
                避免露骨歌词
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#e8a04a",
                color: "#000",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              应用约束
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
