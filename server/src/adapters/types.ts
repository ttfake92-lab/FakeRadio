import type { ContextFragment, DjDecision, StorySourceNote, Track, TtsResult } from "@fakeradio/shared";

export type AdapterStatus = "ready" | "disabled" | "error";

export type AdapterHealth = {
  llm: AdapterStatus;
  music: AdapterStatus;
  tts: AdapterStatus;
  weather: AdapterStatus;
  calendar: AdapterStatus;
  upnp: AdapterStatus;
};

/** Generates DJ narration decisions from context fragments. */
export type LlmAdapter = {
  compute(fragments: ContextFragment[]): Promise<DjDecision>;
  computeRaw(fragments: ContextFragment[]): Promise<string>;
  /** Send a free-form prompt and get structured JSON back. */
  computeJson<T>(systemPrompt: string, userPrompt: string): Promise<T>;
};

/** Searches, recommends, and resolves audio URLs for tracks. */
export type MusicAdapter = {
  search(query: string): Promise<Track[]>;
  recommend(input: { mood: string; limit: number }): Promise<Track[]>;
  resolve(track: Track): Promise<Track>;
};

/** Converts text to speech audio. */
export type TtsAdapter = {
  synthesize(text: string): Promise<TtsResult>;
};

export type WeatherSnapshot = {
  summary: string;
  moodHint: string;
  temperatureC?: number;
};

export type CalendarItem = {
  title: string;
  start: string;
  end: string;
};

export type PlaybackDevice = {
  id: string;
  name: string;
  kind: "browser" | "upnp";
  status: "available" | "offline";
};

export type WeatherAdapter = {
  current(): Promise<WeatherSnapshot>;
};

export type CalendarAdapter = {
  upcoming(): Promise<CalendarItem[]>;
};

export type DeviceAdapter = {
  list(): Promise<PlaybackDevice[]>;
};

/** Gathers contextual source notes about a track for story generation. */
export type StorySourceAdapter = {
  gather(track: Track): Promise<StorySourceNote[]>;
};
