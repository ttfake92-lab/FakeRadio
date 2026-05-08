import type { CalendarAdapter, CalendarItem } from "../../adapters/types.js";

interface LarkTokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: LarkTokenCache | null = null;

async function getLarkToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: clientId, app_secret: clientSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Lark auth failed: ${data.msg}`);
  tokenCache = { accessToken: data.tenant_access_token, expiresAt: Date.now() + data.expire * 1000 };
  return tokenCache.accessToken;
}

export function createLarkCalendarAdapter(opts: {
  clientId: string;
  clientSecret: string;
}): CalendarAdapter {
  return {
    async upcoming(): Promise<CalendarItem[]> {
      const token = await getLarkToken(opts.clientId, opts.clientSecret);
      const now = new Date();
      const end = new Date(now.getTime() + 8 * 60 * 60 * 1000); // next 8 hours
      const res = await fetch(
        `https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events?start_time=${Math.floor(now.getTime() / 1000)}&end_time=${Math.floor(end.getTime() / 1000)}&fields=title,start_time,end_time`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      return (data.items ?? []).map((ev: { summary: string; start_time: { date_time: string }; end_time: { date_time: string } }) => ({
        title: ev.summary,
        start: ev.start_time.date_time,
        end: ev.end_time.date_time,
      }));
    },
  };
}
