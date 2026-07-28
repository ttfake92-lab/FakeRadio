import { readdir, stat, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import type { StateRepository } from "./state-repository.js";

export type StorageCleanupResult = {
  dbRowsPruned: number;
  ttsFilesDeleted: number;
  audioFilesDeleted: number;
};

// 回收过期存储：DB 旧记录 + 超过保留期的口播/歌曲音频文件。
// 口播文件（cache/tts）没有"丢失后重新合成"的兜底，删掉仍被引用的会让口播哑掉，
// 所以必须跳过 ready 预热集引用的文件；歌曲音频（user/audio）删了会走代理自动重录，
// 跳过引用只是为了保住秒切体验。
export async function runStorageCleanup(options: {
  stateRepo: StateRepository;
  ttsCacheDir: string;
  audioDir: string;
  retentionDays: number;
  nowProvider?: () => Date;
}): Promise<StorageCleanupResult> {
  const now = options.nowProvider?.() ?? new Date();
  const cutoffMs = now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // 先清 DB，再按清完后的 ready 集合决定哪些文件受保护
  const dbRowsPruned = await options.stateRepo.pruneOldData(cutoffIso);

  const protectedTtsFiles = new Set<string>();
  const protectedAudioFiles = new Set<string>();
  for (const json of await options.stateRepo.getReadyEpisodeJsons()) {
    try {
      const episode = JSON.parse(json) as { track?: { id?: string }; story?: { audioUrl?: string } };
      if (episode.story?.audioUrl) protectedTtsFiles.add(basename(episode.story.audioUrl));
      if (episode.track?.id) protectedAudioFiles.add(`${episode.track.id}.mp3`);
    } catch {
      // 坏 JSON 不影响清理，对应文件按年龄正常处理
    }
  }

  const ttsFilesDeleted = await deleteExpiredFiles(options.ttsCacheDir, cutoffMs, protectedTtsFiles);
  const audioFilesDeleted = await deleteExpiredFiles(options.audioDir, cutoffMs, protectedAudioFiles);
  return { dbRowsPruned, ttsFilesDeleted, audioFilesDeleted };
}

async function deleteExpiredFiles(dir: string, cutoffMs: number, protectedFiles: Set<string>): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0; // 目录尚不存在
  }
  let deleted = 0;
  for (const name of entries) {
    if (protectedFiles.has(name)) continue;
    const filePath = join(dir, name);
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.mtimeMs >= cutoffMs) continue;
      await unlink(filePath);
      deleted++;
    } catch {
      // 单个文件失败不阻塞其余清理
    }
  }
  return deleted;
}
