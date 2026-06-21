import { readFile, writeFile, mkdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createWriteLock } from "../utils/shared-utils.js";
import { formatRadioDate } from "../utils/time.js";

export type SessionEntry = {
  timestamp: string;
  role: "user" | "agent";
  text: string;
  trackId?: string;
  storyType?: "background" | "personal-memory" | "mood-reading";
};

export type SessionRepository = {
  appendMessage(entry: SessionEntry): Promise<void>;
  getToday(): Promise<SessionEntry[]>;
  getByDate(date: string): Promise<SessionEntry[]>;
};

function getSessionPath(baseDir: string, date: string): string {
  return resolve(baseDir, `${date}.json`);
}

export function createSessionRepository(baseDir: string, nowProvider?: () => Date): SessionRepository {
  const now = nowProvider ?? (() => new Date());
  const withWriteLock = createWriteLock();
  // 按日期缓存当日会话，避免 prewarm tick / taste 推断反复全量读 JSON
  const cache = new Map<string, SessionEntry[]>();

  async function readSession(date: string): Promise<SessionEntry[]> {
    const cached = cache.get(date);
    if (cached) return cached;
    const path = getSessionPath(baseDir, date);
    const fileExists = await access(path).then(() => true, () => false);
    if (!fileExists) return [];
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      const entries = Array.isArray(parsed) ? (parsed as SessionEntry[]) : [];
      cache.set(date, entries);
      return entries;
    } catch {
      return [];
    }
  }

  async function writeSession(date: string, entries: SessionEntry[]): Promise<void> {
    const path = getSessionPath(baseDir, date);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf-8");
    cache.set(date, entries);
  }


  return {
    async appendMessage(entry) {
      return withWriteLock(async () => {
        const date = formatRadioDate(now());
        const entries = await readSession(date);
        entries.push(entry);
        await writeSession(date, entries);
      });
    },

    async getToday() {
      return readSession(formatRadioDate(now()));
    },

    async getByDate(date) {
      return readSession(date);
    }
  };
}
