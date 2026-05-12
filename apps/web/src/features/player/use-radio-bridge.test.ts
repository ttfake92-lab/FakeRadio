import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERSONAS, QUICK_PROMPTS, SKINS, fmt, type Persona, type VisualTrack } from "./skin-config";

describe("skin-config", () => {
  it("PERSONAS has 4 entries", () => {
    expect(Object.keys(PERSONAS)).toHaveLength(4);
    expect(PERSONAS.midnight).toBeDefined();
    expect(PERSONAS.morning).toBeDefined();
    expect(PERSONAS.buddy).toBeDefined();
    expect(PERSONAS.cool).toBeDefined();
  });

  it("PERSONAS.midnight has required fields", () => {
    const p = PERSONAS.midnight;
    expect(p).toHaveProperty("name", "深夜电台");
    expect(p).toHaveProperty("short", "阿夜");
    expect(p).toHaveProperty("tag");
    expect(p).toHaveProperty("sysPrompt");
    expect(p).toHaveProperty("moodWords");
    expect(p.moodWords.length).toBeGreaterThan(0);
  });

  it("SKINS has 5 entries", () => {
    expect(Object.keys(SKINS)).toHaveLength(5);
    expect(SKINS.amber).toBeDefined();
    expect(SKINS.pixel).toBeDefined();
    expect(SKINS.terminal).toBeDefined();
    expect(SKINS.bento).toBeDefined();
    expect(SKINS.y2k).toBeDefined();
  });

  it("QUICK_PROMPTS has 5 entries", () => {
    expect(QUICK_PROMPTS).toHaveLength(5);
  });

  it("fmt formats seconds correctly", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(60)).toBe("1:00");
    expect(fmt(90)).toBe("1:30");
    expect(fmt(218)).toBe("3:38");
    expect(fmt(3600)).toBe("60:00");
  });

  it("fmt floors fractional seconds for media currentTime", () => {
    expect(fmt(6.347532)).toBe("0:06");
    expect(fmt(65.9)).toBe("1:05");
  });
});

describe("useRadioBridge types", () => {
  it("VisualTrack type is compatible with skin components", () => {
    const mockTrack: VisualTrack = {
      id: "t1",
      title: "夜车",
      artist: "陈粒",
      album: "如也",
      dur: 218,
      source: "netease",
      tone: ["#3a2618", "#a4543a", "#f0c89b"],
    };
    expect(mockTrack.id).toBe("t1");
    expect(mockTrack.tone.length).toBe(3);
  });

  it("Persona type matches PERSONAS structure", () => {
    const p: Persona = PERSONAS.midnight;
    expect(p.name).toBe("深夜电台");
    expect(typeof p.sysPrompt).toBe("string");
    expect(p.moodWords.length).toBeGreaterThan(0);
  });
});
