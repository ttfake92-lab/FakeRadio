# Netease QR Login 404 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 404 error during Netease QR login by allowing `fetchJson` to use POST requests, and fallback logic if an endpoint is moved.

**Architecture:** 
The issue stems from the Netease API's `/login/status` and `/login/qr/check` potentially requiring POST requests in newer versions, or returning 301/404 on GET requests when checking for authorization. We will update `NeteaseFetchJson` to accept a `method` inside the options, defaulting to `POST` for `login` related mutating endpoints to ensure compatibility with `NeteaseCloudMusicApi`. 
We will also add an option to pass `noCookie` to avoid sending invalid cookies during login checks.

**Tech Stack:** TypeScript, Node.js

---

### Task 1: Enhance `NeteaseHttpClient` to support HTTP Methods and Body

**Files:**
- Modify: `server/src/adapters/music/netease-http-client.ts`

- [ ] **Step 1: Write the implementation**

Update `NeteaseFetchJson` signature and implementation to support `method` and `body`.

```typescript
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
```

Modify the implementation inside `createNeteaseHttpClient`:

```typescript
    async fetchJson(path, options = {}) {
      const url = new URL(`${normalizedBaseUrl}${path.startsWith("/") ? path : \`/\${path}\`}`);
      const method = options.method ?? "POST";

      if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        }
      }
      
      // Some endpoints prefer timestamps to avoid caching
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
        body: reqBody,
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Netease HTTP request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    }
```

- [ ] **Step 2: Commit**

```bash
git add server/src/adapters/music/netease-http-client.ts
git commit -m "fix: enhance netease http client to support POST methods"
```

### Task 2: Update `netease-auth.ts` to use new `fetchJson` signature

**Files:**
- Modify: `server/src/adapters/music/netease-auth.ts`

- [ ] **Step 1: Write the implementation**

Update calls in `getStatus`:
```typescript
      try {
        const response = (await fetchJson("/login/status", {
          method: "POST",
          noCookie: cookie === null // Don't send empty cookie string
        })) as NeteaseLoginStatusResponse;
```

Update calls in `createQrLogin`:
```typescript
      const keyResponse = (await fetchJson("/login/qr/key", { 
          method: "POST",
          noCookie: true 
      })) as NeteaseQrKeyResponse;

      // ...
      const qrResponse = (await fetchJson("/login/qr/create", {
        method: "POST",
        noCookie: true,
        query: { key, qrimg: "true" }
      })) as NeteaseQrCreateResponse;
```

Update calls in `checkQrLogin`:
```typescript
        const response = (await fetchJson("/login/qr/check", {
          method: "POST",
          noCookie: true,
          query: { key }
        })) as NeteaseQrCheckResponse;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/adapters/music/netease-auth.ts
git commit -m "fix: update netease auth to use POST requests for login endpoints"
```

### Task 3: Update `netease-http-music-adapter.ts` to use new `fetchJson` signature

**Files:**
- Modify: `server/src/adapters/music/netease-http-music-adapter.ts`

- [ ] **Step 1: Write the implementation**

Update calls in `search`:
```typescript
      const response = (await fetchJson("/cloudsearch", {
        method: "POST",
        query: { keywords: query, limit: DEFAULT_SEARCH_LIMIT, type: 1 }
      })) as CloudSearchResponse;
```

Update calls in `resolve`:
```typescript
      try {
        const preferredResponse = (await fetchJson("/song/url/v1", {
          method: "POST",
          query: { id: track.id, level: audioLevel }
        })) as SongUrlResponse;
        // ...
      } catch {
        // ...
      }

      const response = (await fetchJson("/song/url", {
        method: "POST",
        query: { id: track.id }
      })) as SongUrlResponse;
```

- [ ] **Step 2: Run Tests**

Run `pnpm test` to ensure adapters and auth tests still pass (or fix tests if they mock `fetchJson` strictly).

- [ ] **Step 3: Commit**

```bash
git add server/src/adapters/music/netease-http-music-adapter.ts
git commit -m "fix: update netease music adapter to use new fetchJson signature"
```