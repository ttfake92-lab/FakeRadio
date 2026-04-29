export type RadioIntent = "chat" | "next-track" | "planned-radio";

export function routeIntent(message: string): RadioIntent {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("下一首") || normalized.includes("next")) {
    return "next-track";
  }

  if (normalized.includes("今天") || normalized.includes("计划") || normalized.includes("plan")) {
    return "planned-radio";
  }

  return "chat";
}
