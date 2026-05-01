import type { ContextFragment, DjDecision, StorySourceNote, Track, TtsResult } from "@fakeradio/shared";

export type AdapterStatus = "mock" | "ready" | "disabled";

export type AdapterHealth = {
  llm: AdapterStatus;
  music: AdapterStatus;
  tts: AdapterStatus;
  weather: AdapterStatus;
  calendar: AdapterStatus;
  upnp: AdapterStatus;
};

export type LlmAdapter = {
  compute(fragments: ContextFragment[]): Promise<DjDecision>;
};

export type MusicAdapter = {
  search(query: string): Promise<Track[]>;
  recommend(input: { mood: string; limit: number }): Promise<Track[]>;
  resolve(track: Track): Promise<Track>;
};

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

export type StorySourceAdapter = {
  gather(track: Track): Promise<StorySourceNote[]>;
};
