export type NeteaseFetchJsonOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  noCookie?: boolean;
};

export type NeteaseFetchJson = (
  path: string,
  options?: NeteaseFetchJsonOptions
) => Promise<unknown>;

export type NeteaseHttpClient = {
  fetchJson: NeteaseFetchJson;
};

export type CreateNeteaseHttpClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch | undefined;
  cookieProvider?: (() => Promise<string | null>) | undefined;
};

export function createNeteaseHttpClient({
  baseUrl,
  timeoutMs,
  fetchImpl = fetch,
  cookieProvider
}: CreateNeteaseHttpClientOptions): NeteaseHttpClient {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  return {
    async fetchJson(path, options = {}) {
      const url = new URL(`${normalizedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
      const method = options.method ?? "POST";

      if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      if (!url.searchParams.has("timestamp")) {
        url.searchParams.set("timestamp", String(Date.now()));
      }

      const headers: Record<string, string> = {
        accept: "application/json"
      };

      if (!options.noCookie) {
        const cookie = await cookieProvider?.();
        if (cookie !== undefined && cookie !== null && cookie.trim().length > 0) {
          headers.cookie = cookie.trim();
        }
      }

      let reqBody: string | undefined;
      if (options.body && method === "POST") {
        headers["Content-Type"] = "application/json";
        reqBody = JSON.stringify(options.body);
      }

      const response = await fetchImpl(url.toString(), {
        method,
        headers,
        ...(reqBody !== undefined ? { body: reqBody } : {}),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Netease HTTP request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    }
  };
}
