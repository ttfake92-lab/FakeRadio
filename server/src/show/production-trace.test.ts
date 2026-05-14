import { describe, expect, it } from "vitest";
import { redactSensitiveData, redactTechTraceEntry, redactProductionLog, redactArbitraryEntry } from "./production-trace.js";

describe("ProductionTrace", () => {
  describe("redactTechTraceEntry", () => {
    it("redacts API keys in summary", () => {
      const entry = {
        timestamp: "2026-05-12T10:00:00.000Z",
        type: "llm" as const,
        operation: "chat",
        provider: "openai",
        summary: "API call with key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",
        durationMs: 500,
        success: true
      };

      const result = redactTechTraceEntry(entry);

      expect(result.summary).toBe("API call with key [REDACTED]");
      expect(result.timestamp).toBe(entry.timestamp);
      expect(result.type).toBe(entry.type);
      expect(result.operation).toBe(entry.operation);
    });

    it("redacts Bearer tokens in summary", () => {
      const entry = {
        timestamp: "2026-05-12T10:00:00.000Z",
        type: "adapter" as const,
        operation: "fetch",
        provider: "netease",
        summary: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        durationMs: 200,
        success: true
      };

      const result = redactTechTraceEntry(entry);

      expect(result.summary).toBe("Authorization: Bearer [REDACTED]");
    });

    it("redacts system prompt in summary", () => {
      const entry = {
        timestamp: "2026-05-12T10:00:00.000Z",
        type: "llm" as const,
        operation: "chat",
        provider: "openai",
        summary: "System prompt: You are a helpful DJ assistant...",
        durationMs: 100,
        success: true
      };

      const result = redactTechTraceEntry(entry);

      expect(result.summary).toBe("System prompt: [REDACTED]");
    });

    it("redacts errorSummary when present", () => {
      const entry = {
        timestamp: "2026-05-12T10:00:00.000Z",
        type: "adapter" as const,
        operation: "search",
        provider: "spotify",
        summary: "Search failed",
        errorSummary: "Auth failed with token sk-proj-abc123def456",
        durationMs: 300,
        success: false
      };

      const result = redactTechTraceEntry(entry);

      expect(result.errorSummary).toBe("Auth failed with token [REDACTED]");
    });

    it("preserves non-sensitive fields", () => {
      const entry = {
        timestamp: "2026-05-12T10:00:00.000Z",
        type: "adapter" as const,
        operation: "research",
        provider: "web",
        summary: "Found 5 sources for Bee Gees",
        durationMs: 500,
        success: true
      };

      const result = redactTechTraceEntry(entry);

      expect(result).toEqual(entry);
    });
  });

  describe("redactProductionLog", () => {
    it("redacts API keys in log message", () => {
      const log = {
        level: "info" as const,
        message: "Using API key sk-proj-secret123",
        timestamp: "2026-05-12T10:00:00.000Z",
        phase: "planning"
      };

      const result = redactProductionLog(log);

      expect(result.message).toBe("Using API key [REDACTED]");
      expect(result.level).toBe(log.level);
      expect(result.phase).toBe(log.phase);
    });

    it("redacts cookie information", () => {
      const log = {
        level: "debug" as const,
        message: "Cookie: MUSIC_U=abc123def456",
        timestamp: "2026-05-12T10:00:00.000Z"
      };

      const result = redactProductionLog(log);

      expect(result.message).toBe("Cookie: [REDACTED]");
    });

    it("redacts user memory content", () => {
      const log = {
        level: "info" as const,
        message: "User memory: loves jazz music",
        timestamp: "2026-05-12T10:00:00.000Z"
      };

      const result = redactProductionLog(log);

      expect(result.message).toBe("User memory: [REDACTED]");
    });

    it("preserves non-sensitive log messages", () => {
      const log = {
        level: "info" as const,
        message: "Brief created: Bee Gees theme show",
        timestamp: "2026-05-12T10:00:00.000Z",
        phase: "creation"
      };

      const result = redactProductionLog(log);

      expect(result).toEqual(log);
    });
  });

  describe("redactArbitraryEntry", () => {
    it("redacts sensitive data in nested objects", () => {
      const entry = {
        type: "llm_call",
        metadata: {
          apiKey: "sk-proj-secret123",
          prompt: "System prompt: You are a DJ",
          userMemory: "User memory: likes 80s music"
        },
        timestamp: "2026-05-12T10:00:00.000Z"
      };

      const result = redactArbitraryEntry(entry);

      expect(result.metadata.apiKey).toBe("[REDACTED]");
      expect(result.metadata.prompt).toBe("System prompt: [REDACTED]");
      expect(result.metadata.userMemory).toBe("User memory: [REDACTED]");
      expect(result.type).toBe("llm_call");
      expect(result.timestamp).toBe("2026-05-12T10:00:00.000Z");
    });

    it("redacts sensitive data in arrays", () => {
      const entry = {
        events: [
          { message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
          { message: "Cookie: session=abc123" },
          { message: "Normal log entry" }
        ]
      };

      const result = redactArbitraryEntry(entry);

      expect(result.events[0].message).toBe("Bearer [REDACTED]");
      expect(result.events[1].message).toBe("Cookie: [REDACTED]");
      expect(result.events[2].message).toBe("Normal log entry");
    });

    it("handles deeply nested structures", () => {
      const entry = {
        level1: {
          level2: {
            level3: {
              secret: "password mySecret123",
              normal: "safe value"
            }
          }
        }
      };

      const result = redactArbitraryEntry(entry);

      expect(result.level1.level2.level3.secret).toBe("password [REDACTED]");
      expect(result.level1.level2.level3.normal).toBe("safe value");
    });

    it("preserves non-string types", () => {
      const entry = {
        string: "safe string",
        number: 42,
        boolean: true,
        nullValue: null,
        undefinedValue: undefined,
        nested: {
          num: 123,
          bool: false
        }
      };

      const result = redactArbitraryEntry(entry);

      expect(result.string).toBe("safe string");
      expect(result.number).toBe(42);
      expect(result.boolean).toBe(true);
      expect(result.nullValue).toBe(null);
      expect(result.nested.num).toBe(123);
      expect(result.nested.bool).toBe(false);
    });
  });

  describe("redactSensitiveData", () => {
    it("redacts API keys from logs and trace", () => {
      const input = {
        logs: [
          { level: "info" as const, message: "Using API key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz", timestamp: "2026-05-12T10:00:00.000Z" },
          { level: "info" as const, message: "Request completed", timestamp: "2026-05-12T10:00:01.000Z" }
        ],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "llm" as const, operation: "chat", provider: "openai", summary: "API call with key sk-abc123defghijklmnopqrstuv" }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.logs[0].message).toBe("Using API key [REDACTED]");
      expect(result.logs[1].message).toBe("Request completed");
      expect(result.trace[0].summary).toBe("API call with key [REDACTED]");
    });

    it("redacts Bearer tokens", () => {
      const input = {
        logs: [
          { level: "info" as const, message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", timestamp: "2026-05-12T10:00:00.000Z" }
        ],
        trace: []
      };

      const result = redactSensitiveData(input);

      expect(result.logs[0].message).toBe("Bearer [REDACTED]");
    });

    it("redacts cookies from trace", () => {
      const input = {
        logs: [],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "adapter" as const, operation: "fetch", provider: "netease", summary: "Set-Cookie: session=abc123; Path=/" }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.trace[0].summary).toBe("Set-Cookie: [REDACTED]");
    });

    it("redacts system prompt content", () => {
      const input = {
        logs: [],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "llm" as const, operation: "chat", provider: "openai", summary: "System prompt: You are DJ..." }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.trace[0].summary).toBe("System prompt: [REDACTED]");
    });

    it("redacts memory content from trace", () => {
      const input = {
        logs: [
          { level: "info" as const, message: "Loading user memory", timestamp: "2026-05-12T10:00:00.000Z" }
        ],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "llm" as const, operation: "chat", provider: "openai", summary: "User memory: loves 80s music" }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.trace[0].summary).toBe("User memory: [REDACTED]");
    });

    it("preserves non-sensitive data", () => {
      const input = {
        logs: [
          { level: "info" as const, message: "Brief created: Bee Gees theme show", timestamp: "2026-05-12T10:00:00.000Z" },
          { level: "warn" as const, message: "Fallback to mock adapter", timestamp: "2026-05-12T10:00:01.000Z" }
        ],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "adapter" as const, operation: "research", provider: "web", summary: "Found 5 sources for Bee Gees", durationMs: 500, success: true }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.logs[0].message).toBe("Brief created: Bee Gees theme show");
      expect(result.logs[1].message).toBe("Fallback to mock adapter");
      expect(result.trace[0].summary).toBe("Found 5 sources for Bee Gees");
      expect(result.trace[0].durationMs).toBe(500);
      expect(result.trace[0].success).toBe(true);
    });

    it("handles empty logs and trace", () => {
      const input = { logs: [], trace: [] };
      const result = redactSensitiveData(input);

      expect(result.logs).toEqual([]);
      expect(result.trace).toEqual([]);
    });

    it("redacts netease music cookie", () => {
      const input = {
        logs: [],
        trace: [
          { timestamp: "2026-05-12T10:00:00.000Z", type: "adapter" as const, operation: "search", provider: "netease", summary: "Cookie: MUSIC_U=abc123" }
        ]
      };

      const result = redactSensitiveData(input);

      expect(result.trace[0].summary).toBe("Cookie: [REDACTED]");
    });

    it("redacts password fields", () => {
      const input = {
        logs: [
          { level: "info" as const, message: "Auth with password secret123", timestamp: "2026-05-12T10:00:00.000Z" }
        ],
        trace: []
      };

      const result = redactSensitiveData(input);

      expect(result.logs[0].message).toBe("Auth with password [REDACTED]");
    });
  });
});
