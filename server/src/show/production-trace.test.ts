import { describe, expect, it } from "vitest";
import { redactSensitiveData } from "./production-trace.js";

describe("ProductionTrace", () => {
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
