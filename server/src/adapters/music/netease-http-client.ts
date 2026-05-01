export type NeteaseFetchJson = (
  path: string,
  query?: Record<string, string | number | undefined>
) => Promise<unknown>;

export type NeteaseHttpClient = {
  fetchJson: NeteaseFetchJson;
};

export type CreateNeteaseHttpClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch | undefined;
};

export function createNeteaseHttpClient({
  baseUrl,
  timeoutMs,
  fetchImpl = fetch
}: CreateNeteaseHttpClientOptions): NeteaseHttpClient {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  return {
    async fetchJson(path, query = {}) {
      const url = new URL(`${normalizedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);

      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }

      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: "application/json"
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Netease HTTP request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    }
  };
}
