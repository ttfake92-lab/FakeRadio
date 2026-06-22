import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_USER_TASTE = "喜欢低刺激、持续陪伴的音乐。";
const DEFAULT_ROUTINES = "早晨低刺激启动，工作时段稳定少打扰。";
const DEFAULT_MOOD_RULES = "晴天早晨温暖轻盈。";
// profile 是"你是谁"——身份、生活节奏、对话风格喜好等。默认留空,
// 让用户自己写 user/profile.md;不存在就不注入,避免无关内容污染口播。
const DEFAULT_PROFILE = "";

// taste-writer 复用同一默认值，避免双定义漂移
export { DEFAULT_USER_TASTE };

export const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: "morning-soft-start",
    name: "早晨轻启动",
    description: "温暖、低刺激、适合开始一天。",
    seeds: ["warm morning indie", "soft acoustic sunrise", "light city pop"]
  }
];

export type Playlist = {
  id: string;
  name: string;
  description: string;
  seeds: string[];
};

export type UserPreferences = {
  taste: string;
  routines: string;
  moodRules: string;
  profile: string;
  playlists: Playlist[];
};

function defaultBaseDir(): string {
  if (process.env.FAKERADIO_BASE_DIR) {
    return process.env.FAKERADIO_BASE_DIR;
  }
  return process.cwd();
}

export async function loadUserPreferences(
  baseDir: string = defaultBaseDir()
): Promise<UserPreferences> {
  const [taste, routines, moodRules, profile, playlists] = await Promise.all([
    loadFile(resolve(baseDir, "user/taste.md"), DEFAULT_USER_TASTE),
    loadFile(resolve(baseDir, "user/routines.md"), DEFAULT_ROUTINES),
    loadFile(resolve(baseDir, "user/mood-rules.md"), DEFAULT_MOOD_RULES),
    loadFile(resolve(baseDir, "user/profile.md"), DEFAULT_PROFILE),
    loadPlaylists(resolve(baseDir, "user/playlists.json"))
  ]);

  return { taste, routines, moodRules, profile, playlists };
}

async function loadFile(path: string, fallback: string): Promise<string> {
  try {
    const content = await readFile(path, "utf-8");
    return content.trim();
  } catch {
    return fallback;
  }
}

async function loadPlaylists(path: string): Promise<Playlist[]> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) {
      return DEFAULT_PLAYLISTS;
    }

    const valid = parsed.every(
      (item): item is Playlist =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Playlist).id === "string" &&
        typeof (item as Playlist).name === "string" &&
        typeof (item as Playlist).description === "string" &&
        Array.isArray((item as Playlist).seeds) &&
        (item as Playlist).seeds.every((s) => typeof s === "string")
    );

    return valid ? (parsed as Playlist[]) : DEFAULT_PLAYLISTS;
  } catch {
    return DEFAULT_PLAYLISTS;
  }
}
