import {
  BriefsListResponseSchema,
  ChatResponseSchema,
  EpisodeNextResponseSchema,
  FavoritesResponseSchema,
  GenerateNowRequestSchema,
  GenerateNowResponseSchema,
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
  PersonaResponseSchema,
  UserProfileResponseSchema,
  WeatherNowResponseSchema,
  type DjPersonaOverride,
  type Settings,
  type UpdateSettingsRequest,
  type Track
} from "@fakeradio/shared";

export function getServerBaseUrl() {
  if (process.env.NEXT_PUBLIC_FAKERADIO_SERVER_URL) {
    return process.env.NEXT_PUBLIC_FAKERADIO_SERVER_URL;
  }
  // 局域网访问时自动使用当前页面的 hostname，端口 3301
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3301`;
  }
  return "http://localhost:3301";
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

export async function insertNextTrack(track: Track): Promise<void> {
  const response = await fetch(buildApiUrl("/api/queue/insert-next"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ track })
  });
  if (!response.ok) {
    throw new Error(`insert-next failed: ${response.status}`);
  }
}

export async function sendChat(message: string) {
  const response = await fetch(buildApiUrl("/api/chat"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ message })
  });
  if (!response.ok) {
    throw new Error(`chat failed: ${response.status}`);
  }
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

export async function prefetchNextEpisode() {
  const response = await fetch(buildApiUrl("/api/episode/prefetch"));
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Episode prefetch failed: ${response.status}`);
  }
  return EpisodeNextResponseSchema.parse(await response.json());
}

export type TodayExportTask = {
  id?: string;
  taskId?: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: {
    phase: "collecting" | "mixing" | "concatenating" | "notes" | "packaging" | "done";
    current?: number;
    total?: number;
    trackTitle?: string;
  };
  result?: { downloadUrl: string; trackCount: number; date: string };
  error?: string;
};

export async function exportTodayShow(): Promise<{ taskId: string; status: string }> {
  const response = await fetch(buildApiUrl("/api/export/today"), { method: "POST" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Export failed: ${response.status}`);
  }
  return response.json();
}

export async function getExportTodayStatus(taskId: string): Promise<TodayExportTask> {
  const response = await fetch(buildApiUrl(`/api/export/status/${taskId}`));
  if (!response.ok) {
    throw new Error(`Failed to get export status: ${response.status}`);
  }
  return response.json();
}

export async function reportEpisodePlaying(trackId: string) {
  const response = await fetch(buildApiUrl("/api/episode/playing"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trackId })
  });
  if (!response.ok) {
    throw new Error(`Failed to report playing: ${response.status}`);
  }
  return response.json() as Promise<{ ok: boolean }>;
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
  if (!response.ok) throw new Error(`addFavorite failed: ${response.status}`);
  return response.json() as Promise<{ favorite: { trackId: string; favoritedAt: string } }>;
}

export async function removeFavorite(trackId: string) {
  const response = await fetch(buildApiUrl(`/api/favorites/${trackId}`), {
    method: "DELETE"
  });
  if (!response.ok) throw new Error(`removeFavorite failed: ${response.status}`);
  return response.json() as Promise<{ removed: boolean }>;
}

export async function addDislike(track: { trackId: string; title: string; artist: string; album?: string }) {
  const response = await fetch(buildApiUrl("/api/dislikes"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(track)
  });
  if (!response.ok) throw new Error(`addDislike failed: ${response.status}`);
  return response.json() as Promise<{ dislike: { trackId: string; dislikedAt: string } }>;
}

export async function removeDislike(trackId: string) {
  const response = await fetch(buildApiUrl(`/api/dislikes/${trackId}`), {
    method: "DELETE"
  });
  if (!response.ok) throw new Error(`removeDislike failed: ${response.status}`);
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

export async function getJob(jobId: string) {
  try {
    const response = await fetch(buildApiUrl(`/api/jobs/${jobId}`));
    if (!response.ok) {
      return { job: null };
    }
    return ShowJobResponseSchema.parse(await response.json());
  } catch {
    return { job: null };
  }
}

export async function getShowProjects() {
  const response = await fetch(buildApiUrl("/api/shows"));
  if (!response.ok) {
    return { projects: [] };
  }
  return ShowProjectsListResponseSchema.parse(await response.json());
}

export async function generateNow(briefId: string) {
  const body = GenerateNowRequestSchema.parse({ briefId });
  const response = await fetch(buildApiUrl("/api/shows/generate-now"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      phase?: string;
    };
    if (response.status >= 500) {
      const parsed = GenerateNowResponseSchema.safeParse(errorBody);
      if (parsed.success) return parsed.data;
    }
    // fastify 默认 error response 是 { statusCode, error: "Internal Server Error", message: "..." }
    // 其中 error 是错误类名 (不可读), message 才是具体原因。优先用我们后端 catch 块返回的 error 字段,
    // 没有就 fallback 到 fastify 的 message。
    const detailed = errorBody.error && errorBody.error !== "Internal Server Error"
      ? errorBody.error
      : errorBody.message;
    const phasePrefix = errorBody.phase ? `[${errorBody.phase}] ` : "";
    throw new Error(`${phasePrefix}${detailed ?? `Generate failed: ${response.status}`}`);
  }
  return GenerateNowResponseSchema.parse(await response.json());
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

export async function getProjectExportFiles(projectId: string): Promise<{ projectId: string; files: string[] }> {
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

export async function getPersona() {
  const response = await fetch(buildApiUrl("/api/persona"));
  if (!response.ok) {
    throw new Error(`Failed to get persona: ${response.status}`);
  }
  return PersonaResponseSchema.parse(await response.json());
}

export async function updatePersona(override: DjPersonaOverride) {
  const response = await fetch(buildApiUrl("/api/persona"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(override),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to update persona: ${response.status}`);
  }
  return PersonaResponseSchema.parse(await response.json());
}

export async function getUserProfile() {
  const response = await fetch(buildApiUrl("/api/profile"));
  if (!response.ok) {
    throw new Error(`Failed to get profile: ${response.status}`);
  }
  return UserProfileResponseSchema.parse(await response.json());
}

export async function getWeatherNow() {
  const response = await fetch(buildApiUrl("/api/weather"));
  if (!response.ok) {
    throw new Error(`Failed to get weather: ${response.status}`);
  }
  return WeatherNowResponseSchema.parse(await response.json());
}

export type AvatarKind = "dj" | "user";

export function buildAvatarUrl(kind: AvatarKind, version: number) {
  return buildApiUrl(`/api/avatar/${kind}?v=${version}`);
}

export async function uploadAvatar(kind: AvatarKind, dataUrl: string) {
  const response = await fetch(buildApiUrl(`/api/avatar/${kind}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to upload avatar: ${response.status}`);
  }
}

export type TtsVoiceOption = { value: string; label: string };
export type TtsVoicesResponse = {
  mimo: TtsVoiceOption[];
  grok: TtsVoiceOption[];
  grokStyles: TtsVoiceOption[];
};

export async function getTtsVoices(): Promise<TtsVoicesResponse> {
  const response = await fetch(buildApiUrl("/api/tts/voices"));
  if (!response.ok) {
    throw new Error(`Failed to get tts voices: ${response.status}`);
  }
  return response.json() as Promise<TtsVoicesResponse>;
}

export type TtsPreviewParams = {
  provider: "mimo" | "grok" | "fish";
  voice: string;
  style?: string;
  rate?: number;
  text?: string;
};

export async function previewTts(params: TtsPreviewParams): Promise<{ audioUrl: string }> {
  const response = await fetch(buildApiUrl("/api/tts/preview"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `试听失败: ${response.status}`);
  }
  return response.json() as Promise<{ audioUrl: string }>;
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
