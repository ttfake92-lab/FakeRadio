import type { ContextEnvironment } from "../context/context-builder.js";

export function buildMockEnvironment(): ContextEnvironment {
  return {
    weather: { summary: "mock weather", moodHint: "mock" },
    calendar: [{ title: "mock calendar", start: "09:00", end: "10:00" }],
    devices: [{ id: "local-browser", name: "Local Browser", kind: "browser", status: "available" }]
  };
}
