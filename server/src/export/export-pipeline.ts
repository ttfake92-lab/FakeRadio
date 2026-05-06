import { formatRadioDate } from "../utils/time.js";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import type { FavoriteTrack } from "@fakeradio/shared";
import type { FavoritesRepository } from "../user/favorites-repository.js";
import type { TrackRegistry } from "../audio/track-registry.js";
import { getAudioFilePath } from "../audio/audio-recorder.js";
import { mixEpisodeAudio, checkFfmpegAvailable, type MixProgress } from "./audio-mixer.js";
import { generateShowNotes, type ShowNotesTrack } from "./show-notes-generator.js";

export type ExportPipelineDeps = {
  favorites: FavoritesRepository;
  trackRegistry: TrackRegistry;
  audioDir: string;
  exportDir: string;
  ttsCacheDir: string;
};

export type ExportProgress = {
  phase: "collecting" | "mixing" | "concatenating" | "notes" | "packaging" | "done";
  current?: number;
  total?: number;
  trackTitle?: string;
};

export type ExportResult = {
  downloadUrl: string;
  trackCount: number;
  date: string;
};

function formatDate(date: Date): string {
  return formatRadioDate(date);
}

async function concatAudioFiles(inputs: string[], outputPath: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const listPath = outputPath + ".list.txt";
  const listContent = inputs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent, "utf-8");

  return new Promise((resolve, reject) => {
    execFile("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-codec:a", "copy",
      outputPath
    ], (error) => {
      if (error) reject(new Error(`FFmpeg concat failed: ${error.message}`));
      else resolve();
    });
  });
}

function createZip(exportDir: string, date: string, audioPath: string, notesPath: string): Promise<string> {
  const zipPath = resolve(exportDir, `${date}.zip`);
  return new Promise((resolveZip, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolveZip(zipPath));
    archive.on("error", reject);

    archive.pipe(output);
    archive.file(audioPath, { name: "show.mp3" });
    archive.file(notesPath, { name: "show-notes.md" });
    archive.finalize();
  });
}

export async function exportToday(
  deps: ExportPipelineDeps,
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportResult> {
  const hasFfmpeg = await checkFfmpegAvailable();
  if (!hasFfmpeg) throw new Error("FFmpeg not available — cannot export audio");

  const date = formatDate(new Date());
  const exportDateDir = resolve(deps.exportDir, date);
  await mkdir(exportDateDir, { recursive: true });

  // Collect interactive tracks
  onProgress?.({ phase: "collecting" });
  const favorites = await deps.favorites.list();
  if (favorites.length === 0) {
    throw new Error("今天还没有收藏或故事内容，先和电台互动一下吧");
  }

  // Build show notes data and collect audio paths
  const showTracks: ShowNotesTrack[] = [];
  const mixedPaths: string[] = [];

  for (let i = 0; i < favorites.length; i++) {
    const fav = favorites[i]!;
    const track = deps.trackRegistry.get(fav.trackId);
    const musicPath = track ? getAudioFilePath(deps.audioDir, track.id) : null;

    if (!musicPath || !existsSync(musicPath)) continue;

    onProgress?.({ phase: "mixing", current: i + 1, total: favorites.length, trackTitle: fav.title });

    // For now, use music directly (TTS stories not yet persisted — A-07)
    const outputPath = resolve(exportDateDir, `track-${i}.mp3`);

    // Normalize music to consistent format for concat
    const { execFile } = await import("node:child_process");
    await new Promise<void>((resolveNorm, rejectNorm) => {
      execFile("ffmpeg", [
        "-y", "-i", musicPath,
        "-codec:a", "libmp3lame", "-b:a", "192k",
        "-ar", "44100", "-ac", "2",
        outputPath
      ], (err) => err ? rejectNorm(err) : resolveNorm());
    });

    mixedPaths.push(outputPath);
    showTracks.push({
      title: fav.title,
      artist: fav.artist,
      djStory: "（故事内容将在对话持久化后可用）",
      storyType: "mood-reading"
    });
  }

  if (mixedPaths.length === 0) {
    throw new Error("没有可用的音频文件，先播放一些歌曲吧");
  }

  // Concatenate
  onProgress?.({ phase: "concatenating" });
  const concatPath = resolve(exportDateDir, "show.mp3");
  if (mixedPaths.length === 1) {
    const { rename } = await import("node:fs/promises");
    await rename(mixedPaths[0]!, concatPath);
  } else {
    await concatAudioFiles(mixedPaths, concatPath);
  }

  // Show notes
  onProgress?.({ phase: "notes" });
  const notesContent = generateShowNotes({ date, tracks: showTracks });
  const notesPath = resolve(exportDateDir, "show-notes.md");
  await writeFile(notesPath, notesContent, "utf-8");

  // Package ZIP
  onProgress?.({ phase: "packaging" });
  const zipPath = await createZip(deps.exportDir, date, concatPath, notesPath);

  onProgress?.({ phase: "done" });

  return {
    downloadUrl: `/api/export/download/${date}`,
    trackCount: mixedPaths.length,
    date
  };
}

export async function getExportFilePath(exportDir: string, date: string): Promise<string | null> {
  const zipPath = resolve(exportDir, `${date}.zip`);
  return existsSync(zipPath) ? zipPath : null;
}
