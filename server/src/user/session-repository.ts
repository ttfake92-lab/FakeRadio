import { formatRadioDate } from "../utils/time.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

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

function formatDate(date: Date): string {
  return formatRadioDate(date);
}

function getSessionPath(baseDir: string, date: string): string {
  return resolve(baseDir, `${date}.json`);
}

export function createSessionRepository(baseDir: string, nowProvider?: () => Date): SessionRepository {
  const now = nowProvider ?? (() => new Date());

  async function readSession(date: string): Promise<SessionEntry[]> {
    const path = getSessionPath(baseDir, date);
    if (!existsSync(path)) return [];
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed) ? (parsed as SessionEntry[]) : [];
    } catch {
      return [];
    }
  }

  async function writeSession(date: string, entries: SessionEntry[]): Promise<void> {
    const path = getSessionPath(baseDir, date);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf-8");
  }

  return {
    async appendMessage(entry) {
      const date = formatDate(now());
      const entries = await readSession(date);
      entries.push(entry);
      await writeSession(date, entries);
    },

    async getToday() {
      return readSession(formatDate(now()));
    },

    async getByDate(date) {
      return readSession(date);
    }
  };
}
