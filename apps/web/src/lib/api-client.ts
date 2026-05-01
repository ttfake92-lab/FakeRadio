import {
  ChatResponseSchema,
  EpisodeNextResponseSchema,
  HealthResponseSchema,
  NextResponseSchema,
  NowResponseSchema,
  TasteResponseSchema,
  TodayPlanResponseSchema
} from "@fakeradio/shared";

export function getServerBaseUrl() {
  return process.env.NEXT_PUBLIC_FAKERADIO_SERVER_URL ?? "http://localhost:3001";
}

export function buildApiUrl(path: string) {
  return new URL(path, getServerBaseUrl()).toString();
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
