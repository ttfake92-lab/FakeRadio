import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createLarkCalendarAdapter } from "./lark-calendar-adapter.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeTokenResponse(overrides: Partial<{ code: number; msg: string; tenant_access_token: string; expire: number }> = {}) {
  return {
    code: 0,
    msg: "ok",
    tenant_access_token: "test-token-abc",
    expire: 7200, // 2 hours in seconds
    ...overrides,
  };
}

function makeCalendarResponse(items: Array<{ summary: string; start_time: { date_time: string }; end_time: { date_time: string } }> = []) {
  return { items };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LarkCalendarAdapter", () => {
  describe("token caching", () => {
    it("fetches a new token on first call", async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse()),
      });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeCalendarResponse()),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      await adapter.upcoming();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call is the token endpoint
      expect(mockFetch.mock.calls[0][0]).toContain("/auth/v3/tenant_access_token/internal");
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ app_id: "id", app_secret: "secret" });
    });

    it("reuses cached token on subsequent calls within expiry window", async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse()),
      });
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(makeCalendarResponse()),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });

      await adapter.upcoming();
      await adapter.upcoming();
      await adapter.upcoming();

      // Token fetched only once, calendar called 3 times
      const tokenCalls = mockFetch.mock.calls.filter((c: string[]) =>
        (c[0] as string).includes("/auth/v3/")
      );
      expect(tokenCalls).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 token + 3 calendar
    });

    it("refreshes token when within 60s of expiry", async () => {
      const baseTime = new Date("2026-05-29T10:00:00Z").getTime();
      vi.setSystemTime(baseTime);

      // Token expires in 61 seconds (just outside the 60s buffer)
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse({ expire: 61 })),
      });
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(makeCalendarResponse()),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      await adapter.upcoming();

      // Advance time by 2 seconds — now 59s before expiry, inside the buffer
      vi.setSystemTime(baseTime + 2000);

      // Need a second token fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse({ tenant_access_token: "new-token", expire: 7200 })),
      });

      await adapter.upcoming();

      const tokenCalls = mockFetch.mock.calls.filter((c: string[]) =>
        (c[0] as string).includes("/auth/v3/")
      );
      expect(tokenCalls).toHaveLength(2);
      // Second token call should get a fresh token
      expect(JSON.parse(tokenCalls[1][1].body)).toEqual({ app_id: "id", app_secret: "secret" });
    });

    it("does NOT refresh token when still more than 60s from expiry", async () => {
      const baseTime = new Date("2026-05-29T10:00:00Z").getTime();
      vi.setSystemTime(baseTime);

      // Token expires in 120 seconds
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse({ expire: 120 })),
      });
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(makeCalendarResponse()),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      await adapter.upcoming();

      // Advance 50 seconds — still 70s before expiry, outside buffer
      vi.setSystemTime(baseTime + 50_000);
      await adapter.upcoming();

      const tokenCalls = mockFetch.mock.calls.filter((c: string[]) =>
        (c[0] as string).includes("/auth/v3/")
      );
      expect(tokenCalls).toHaveLength(1); // Only one token fetch
    });

    it("throws when Lark auth returns non-zero code", async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse({ code: 10003, msg: "invalid app_id" })),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "bad", clientSecret: "bad" });
      await expect(adapter.upcoming()).rejects.toThrow("Lark auth failed: invalid app_id");
    });
  });

  describe("upcoming()", () => {
    it("calls the calendar events API with correct parameters", async () => {
      const baseTime = new Date("2026-05-29T10:00:00Z").getTime();
      vi.setSystemTime(baseTime);

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse()),
      });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeCalendarResponse([
          {
            summary: "Morning Meeting",
            start_time: { date_time: "2026-05-29T11:00:00" },
            end_time: { date_time: "2026-05-29T12:00:00" },
          },
        ])),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      const result = await adapter.upcoming();

      // Verify the calendar API URL has correct time range
      const calendarCall = mockFetch.mock.calls[1];
      const url = calendarCall[0] as string;
      expect(url).toContain("/calendar/v4/calendars/primary/events");
      expect(url).toContain(`start_time=${Math.floor(baseTime / 1000)}`);
      expect(url).toContain(`end_time=${Math.floor((baseTime + 8 * 3600_000) / 1000)}`);

      // Verify authorization header
      expect(calendarCall[1].headers.Authorization).toBe("Bearer test-token-abc");

      // Verify response mapping
      expect(result).toEqual([
        { title: "Morning Meeting", start: "2026-05-29T11:00:00", end: "2026-05-29T12:00:00" },
      ]);
    });

    it("returns empty array when no calendar items", async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse()),
      });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeCalendarResponse([])),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      const result = await adapter.upcoming();

      expect(result).toEqual([]);
    });

    it("returns empty array when items field is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(makeTokenResponse()),
      });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const adapter = createLarkCalendarAdapter({ clientId: "id", clientSecret: "secret" });
      const result = await adapter.upcoming();

      expect(result).toEqual([]);
    });
  });
});
