import type { ProductionLog, TechTraceEntry } from "@fakeradio/shared";

const REDACTED = "[REDACTED]";

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9_-]{10,}/g, replacement: REDACTED, label: "API key" },
  { pattern: /Bearer\s+(eyJ[a-zA-Z0-9_-]+)/g, replacement: `Bearer ${REDACTED}`, label: "Bearer token" },
  { pattern: /Cookie:\s*[^,\n]+/gi, replacement: `Cookie: ${REDACTED}`, label: "Cookie" },
  { pattern: /MUSIC_U=[^;\s]+/gi, replacement: `MUSIC_U=${REDACTED}`, label: "Music cookie" },
  { pattern: /session=[^;\s]+/gi, replacement: `session=${REDACTED}`, label: "Session cookie" },
  { pattern: /password\s+[^\s,]+/gi, replacement: `password ${REDACTED}`, label: "Password" },
  { pattern: /System prompt:\s*.+/gi, replacement: `System prompt: ${REDACTED}`, label: "System prompt" },
  { pattern: /User memory:\s*.+/gi, replacement: `User memory: ${REDACTED}`, label: "User memory" },
  { pattern: /private memory:\s*.+/gi, replacement: `private memory: ${REDACTED}`, label: "Private memory" },
  { pattern: /personal memory:\s*.+/gi, replacement: `personal memory: ${REDACTED}`, label: "Personal memory" }
];

function redactString(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = redactString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => 
        typeof item === "object" && item !== null ? redactObject(item as Record<string, unknown>) :
        typeof item === "string" ? redactString(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function redactSensitiveData(data: {
  logs: ProductionLog[];
  trace: TechTraceEntry[];
}): {
  logs: ProductionLog[];
  trace: TechTraceEntry[];
} {
  return {
    logs: data.logs.map((log) => ({
      ...log,
      message: redactString(log.message)
    })),
    trace: data.trace.map((entry) => ({
      ...entry,
      summary: redactString(entry.summary),
      errorSummary: entry.errorSummary ? redactString(entry.errorSummary) : undefined
    }))
  };
}

export function redactTechTraceEntry(entry: TechTraceEntry): TechTraceEntry {
  return {
    ...entry,
    summary: redactString(entry.summary),
    errorSummary: entry.errorSummary ? redactString(entry.errorSummary) : undefined
  };
}

export function redactProductionLog(log: ProductionLog): ProductionLog {
  return {
    ...log,
    message: redactString(log.message)
  };
}

export function redactArbitraryEntry(entry: Record<string, unknown>): Record<string, unknown> {
  return redactObject(entry);
}

export function createProductionLog(
  level: ProductionLog["level"],
  message: string,
  phase?: string
): Omit<ProductionLog, "timestamp"> {
  return { level, message, phase };
}

export function createTechTraceEntry(
  type: TechTraceEntry["type"],
  operation: string,
  summary: string,
  options?: {
    provider?: string;
    durationMs?: number;
    success?: boolean;
    errorSummary?: string;
  }
): Omit<TechTraceEntry, "timestamp"> {
  return {
    type,
    operation,
    summary,
    provider: options?.provider,
    durationMs: options?.durationMs,
    success: options?.success ?? true,
    errorSummary: options?.errorSummary
  };
}
