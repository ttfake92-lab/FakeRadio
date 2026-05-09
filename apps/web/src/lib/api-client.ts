import {
  ChatResponseSchema,
  EpisodeNextResponseSchema,
  FavoritesResponseSchema,
  HealthResponseSchema,
  NeteaseCookieSubmitResponseSchema,
  NeteaseLoginStatusSchema,
  NeteaseQrLoginChallengeSchema,
  NeteaseQrLoginCheckSchema,
  NextResponseSchema,
  NowResponseSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema
} from "@fakeradio/shared";

export function getServerBaseUrl() {
  return process.env.NEXT_PUBLIC_FAKERADIO_SERVER_URL ?? "http://localhost:3301";
}

export function buildApiUrl(path: string) {
  return new URL(path, getServerBaseUrl()).toString();
}

export function buildMediaUrl(url: string | undefined) {
  if (url === undefined || url.length === 0) return undefined;
  return new URL(url, getServerBaseUrl()).toString();
}

export function buildStreamUrl(path: string) {
  const url = new URL(path, getServerBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function getNow() {
  const response = await fetch(buildApiUrl("/api/now"));
  return NowResponseSchema.parse(await response.json());
}

export async function getHealth() {
  const response = await fetch(buildApiUrl("/api/health"));
  return HealthResponseSchema.parse(await response.json());
}

export async function getNext() {
  const response = await fetch(buildApiUrl("/api/next"));
  return NextResponseSchema.parse(await response.json());
}

export async function sendChat(message: string) {
  const response = await fetch(buildApiUrl("/api/chat"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ message })
  });
  return ChatResponseSchema.parse(await response.json());
}

export async function getNextEpisode() {
  const response = await fetch(buildApiUrl("/api/episode/next"));
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Episode generation failed: ${response.status}`);
  }
  return EpisodeNextResponseSchema.parse(await response.json());
}

export async function getTaste() {
  const response = await fetch(buildApiUrl("/api/taste"));
  return TasteResponseSchema.parse(await response.json());
}

export async function getTodayPlan() {
  const response = await fetch(buildApiUrl("/api/plan/today"));
  return TodayPlanResponseSchema.parse(await response.json());
}

export async function getFavorites() {
  const response = await fetch(buildApiUrl("/api/favorites"));
  return FavoritesResponseSchema.parse(await response.json());
}

export async function getNeteaseLoginStatus() {
  const response = await fetch(buildApiUrl("/api/netease/login/status"));
  return NeteaseLoginStatusSchema.parse(await response.json());
}

export async function createNeteaseQrLogin() {
  const response = await fetch(buildApiUrl("/api/netease/login/qr"), {
    method: "POST"
  });
  return NeteaseQrLoginChallengeSchema.parse(await response.json());
}

export async function checkNeteaseQrLogin(key: string) {
  const response = await fetch(buildApiUrl(`/api/netease/login/qr/${encodeURIComponent(key)}`));
  return NeteaseQrLoginCheckSchema.parse(await response.json());
}

export async function submitNeteaseCookie(cookie: string) {
  const response = await fetch(buildApiUrl("/api/netease/login/cookie"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cookie })
  });
  return NeteaseCookieSubmitResponseSchema.parse(await response.json());
}

export async function addFavorite(track: { trackId: string; title: string; artist: string; album?: string }) {
  const response = await fetch(buildApiUrl("/api/favorites"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(track)
  });
  return response.json() as Promise<{ favorite: { trackId: string; favoritedAt: string } }>;
}

export async function removeFavorite(trackId: string) {
  const response = await fetch(buildApiUrl(`/api/favorites/${trackId}`), {
    method: "DELETE"
  });
  return response.json() as Promise<{ removed: boolean }>;
}
