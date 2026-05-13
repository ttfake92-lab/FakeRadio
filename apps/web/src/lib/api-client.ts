import {
  BriefsListResponseSchema,
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
  PrewarmStatusSchema,
  ShowJobResponseSchema,
  ShowJobsListResponseSchema,
  ShowPlanResponseSchema,
  ShowPlansListResponseSchema,
  ShowProjectsListResponseSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema,
  SettingsResponseSchema,
  type Settings,
  type UpdateSettingsRequest
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

export async function getPrewarmStatus() {
  const response = await fetch(buildApiUrl("/api/prewarm/status"));
  return PrewarmStatusSchema.parse(await response.json());
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

export async function getBriefs() {
  const response = await fetch(buildApiUrl("/api/briefs"));
  if (!response.ok) {
    return { briefs: [] };
  }
  return BriefsListResponseSchema.parse(await response.json());
}

export async function getShowPlans(briefId?: string) {
  const url = briefId ? buildApiUrl(`/api/plans?briefId=${briefId}`) : buildApiUrl("/api/plans");
  const response = await fetch(url);
  if (!response.ok) {
    return { plans: [] };
  }
  return ShowPlansListResponseSchema.parse(await response.json());
}

export async function getShowJobs(briefId?: string) {
  const url = briefId ? buildApiUrl(`/api/jobs?briefId=${briefId}`) : buildApiUrl("/api/jobs");
  const response = await fetch(url);
  if (!response.ok) {
    return { jobs: [] };
  }
  return ShowJobsListResponseSchema.parse(await response.json());
}

export async function getShowProjects() {
  const response = await fetch(buildApiUrl("/api/shows"));
  if (!response.ok) {
    return { projects: [] };
  }
  return ShowProjectsListResponseSchema.parse(await response.json());
}

export async function exportProject(projectId: string, options?: { includeTrace?: boolean }) {
  const response = await fetch(buildApiUrl(`/api/projects/${projectId}/export`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ includeTrace: options?.includeTrace ?? true })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Export failed: ${response.status}`);
  }
  return response.json();
}

export async function getProjectExportFiles(projectId: string) {
  const response = await fetch(buildApiUrl(`/api/export/project/${projectId}/download`));
  if (!response.ok) {
    throw new Error(`Failed to get export files: ${response.status}`);
  }
  return response.json();
}

export async function downloadProjectFile(projectId: string, file: string) {
  const url = buildApiUrl(`/api/export/project/${projectId}/download?file=${encodeURIComponent(file)}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.status}`);
  }
  return response.blob();
}

export async function pauseJob(jobId: string) {
  const response = await fetch(buildApiUrl(`/api/jobs/${jobId}/pause`), {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Pause failed: ${response.status}`);
  }
  return ShowJobResponseSchema.parse(await response.json());
}

export async function resumeJob(jobId: string) {
  const response = await fetch(buildApiUrl(`/api/jobs/${jobId}/resume`), {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Resume failed: ${response.status}`);
  }
  return ShowJobResponseSchema.parse(await response.json());
}

export async function cancelJob(jobId: string) {
  const response = await fetch(buildApiUrl(`/api/jobs/${jobId}/cancel`), {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Cancel failed: ${response.status}`);
  }
  return ShowJobResponseSchema.parse(await response.json());
}

export async function markJobNeedsReplan(jobId: string, reason?: string) {
  const response = await fetch(buildApiUrl(`/api/jobs/${jobId}/needs-replan`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Replan failed: ${response.status}`);
  }
  return ShowJobResponseSchema.parse(await response.json());
}

export type ShowPlanBlockConstraints = {
  preferEra?: string;
  avoidExplicit?: boolean;
  moodHint?: string;
};

export async function addConstraintsToPlan(planId: string, constraints: ShowPlanBlockConstraints) {
  const response = await fetch(buildApiUrl("/api/plans/add-constraints"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, constraints }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Add constraints failed: ${response.status}`);
  }
  return ShowPlanResponseSchema.parse(await response.json());
}

export async function getSettings() {
  const response = await fetch(buildApiUrl("/api/settings"));
  if (!response.ok) {
    throw new Error(`Failed to get settings: ${response.status}`);
  }
  return SettingsResponseSchema.parse(await response.json());
}

export async function updateSettings(settings: UpdateSettingsRequest) {
  const response = await fetch(buildApiUrl("/api/settings"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to update settings: ${response.status}`);
  }
  return SettingsResponseSchema.parse(await response.json());
}

export async function deleteProject(projectId: string) {
  const response = await fetch(buildApiUrl(`/api/shows/${projectId}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to delete project: ${response.status}`);
  }
  return response.json();
}

export async function deleteProjectTrace(projectId: string) {
  const response = await fetch(buildApiUrl(`/api/shows/${projectId}/trace`), {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to delete trace: ${response.status}`);
  }
  return response.json();
}
