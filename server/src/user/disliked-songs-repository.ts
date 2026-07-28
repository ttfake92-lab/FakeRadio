import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DislikedTrack } from "@fakeradio/shared";
import { createWriteLock } from "../utils/shared-utils.js";

// 负反馈事实层:与 favorites 对称的 append-only 记录。
// 永不让 LLM 重写;推荐引擎用它做硬排除与艺术家降权,整理任务用它归纳雷区。
export type DislikedSongsRepository = {
  list(): Promise<DislikedTrack[]>;
  has(trackId: string): Promise<boolean>;
  save(track: Omit<DislikedTrack, "dislikedAt">): Promise<DislikedTrack>;
  remove(trackId: string): Promise<boolean>;
};

export function createDislikedSongsRepository(filePath: string): DislikedSongsRepository {
  const withWriteLock = createWriteLock();

  async function readAll(): Promise<DislikedTrack[]> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as DislikedTrack[];
    } catch {
      return [];
    }
  }

  async function writeAll(dislikes: DislikedTrack[]): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(dislikes, null, 2), "utf-8");
  }

  return {
    async list() {
      return readAll();
    },

    async has(trackId) {
      const dislikes = await readAll();
      return dislikes.some((d) => d.trackId === trackId);
    },

    async save(track) {
      return withWriteLock(async () => {
        const dislikes = await readAll();
        const existing = dislikes.find((d) => d.trackId === track.trackId);
        if (existing) return existing;
        const entry: DislikedTrack = {
          ...track,
          dislikedAt: new Date().toISOString()
        };
        dislikes.push(entry);
        await writeAll(dislikes);
        return entry;
      });
    },

    async remove(trackId) {
      return withWriteLock(async () => {
        const dislikes = await readAll();
        const index = dislikes.findIndex((d) => d.trackId === trackId);
        if (index === -1) return false;
        dislikes.splice(index, 1);
        await writeAll(dislikes);
        return true;
      });
    }
  };
}

// 给 LLM prompt 用的有界摘要:最近 8 首 + 高频雷区艺术家。
// 不塞全量列表——列表会无限增长,画像式压缩才可持续。
export function summarizeDislikesForPrompt(dislikes: DislikedTrack[]): string {
  if (dislikes.length === 0) return "";
  const recent = [...dislikes]
    .sort((a, b) => b.dislikedAt.localeCompare(a.dislikedAt))
    .slice(0, 8)
    .map((entry) => `${entry.title} - ${entry.artist}`);
  const avoided = [...collectAvoidedArtists(dislikes)];
  const parts = [`近期不喜欢: ${recent.join("、")}`];
  if (avoided.length > 0) parts.push(`雷区艺术家(多次不喜欢): ${avoided.join("、")}`);
  return parts.join("；");
}

// 累计 dislike >= minCount 的艺术家(小写规范化)。
// 单次 dislike 只排除单曲,不 nuke 整个艺术家——用户可能只是讨厌这一首。
export function collectAvoidedArtists(dislikes: DislikedTrack[], minCount = 2): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of dislikes) {
    for (const piece of entry.artist.split(/[\/、,&]/).map((s) => s.trim().toLocaleLowerCase()).filter(Boolean)) {
      counts.set(piece, (counts.get(piece) ?? 0) + 1);
    }
  }
  return new Set([...counts.entries()].filter(([, count]) => count >= minCount).map(([artist]) => artist));
}
