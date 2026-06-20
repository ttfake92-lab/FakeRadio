import { formatRadioDate } from "../utils/time.js";
export { exportShowProject } from "./export-show-project.js";
import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
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
  /** 当日播放记录（时间正序）。设计默认：无编排要求时把当日节目串成素材；缺省时回退收藏列表 */
  getTodayPlayed?: () => Promise<Array<{ trackId: string; title: string; artist: string; album?: string | null }>>;
  /** 当日 DJ 口播记录，用于填充 show notes 故事文案 + 混音口播音频 */
  getTodayDjStories?: () => Promise<Array<{ trackId: string | null; text: string; storyType: "background" | "lyric-theme" | "mood-reading" | null; audioUrl?: string | null }>>;
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

export type ExportTask = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: ExportProgress;
  result?: ExportResult;
  error?: string;
};

const tasks = new Map<string, ExportTask>();


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

  const date = formatRadioDate(new Date());
  const exportDateDir = resolve(deps.exportDir, date);
  await mkdir(exportDateDir, { recursive: true });

  // 收集当日素材：默认把当日播放过的节目按时间串起来（设计默认行为），
  // 没有播放记录时回退到收藏列表
  onProgress?.({ phase: "collecting" });
  let sourceTracks: Array<{ trackId: string; title: string; artist: string; album?: string | null }> = [];
  if (deps.getTodayPlayed) {
    const played = await deps.getTodayPlayed();
    const seen = new Set<string>();
    for (const p of played) {
      if (seen.has(p.trackId)) continue;
      seen.add(p.trackId);
      sourceTracks.push(p);
    }
  }
  if (sourceTracks.length === 0) {
    const favorites = await deps.favorites.list();
    sourceTracks = favorites.map((f) => ({
      trackId: f.trackId,
      title: f.title,
      artist: f.artist,
      album: f.album ?? null
    }));
  }
  if (sourceTracks.length === 0) {
    throw new Error("今天还没有播放或收藏记录，先听一会儿电台吧");
  }

  // 当日 DJ 口播按 trackId 对应：文案进 show notes，音频参与混音
  const storyByTrack = new Map<string, { text: string; storyType: ShowNotesTrack["storyType"]; audioUrl: string | null }>();
  if (deps.getTodayDjStories) {
    for (const msg of await deps.getTodayDjStories()) {
      if (msg.trackId) {
        storyByTrack.set(msg.trackId, {
          text: msg.text,
          storyType: msg.storyType ?? "mood-reading",
          audioUrl: msg.audioUrl ?? null
        });
      }
    }
  }

  // /cache/tts/<file> → ttsCacheDir 下的实际文件路径
  const resolveTtsPath = (audioUrl: string | null): string | null => {
    if (!audioUrl || !audioUrl.startsWith("/cache/tts/")) return null;
    return join(deps.ttsCacheDir, audioUrl.slice("/cache/tts/".length));
  };

  // Build show notes data and collect audio paths
  const showTracks: ShowNotesTrack[] = [];
  const mixedPaths: string[] = [];

  for (let i = 0; i < sourceTracks.length; i++) {
    const fav = sourceTracks[i]!;
    const track = deps.trackRegistry.get(fav.trackId);
    const musicPath = track ? getAudioFilePath(deps.audioDir, track.id) : null;

    if (!musicPath) continue;
    try {
      await access(musicPath);
    } catch {
      continue;
    }

    onProgress?.({ phase: "mixing", current: i + 1, total: sourceTracks.length, trackTitle: fav.title });

    const outputPath = resolve(exportDateDir, `track-${i}.mp3`);
    const story = storyByTrack.get(fav.trackId);

    // 有口播音频就做电台感混音（口播压在歌曲前奏上，垫乐渐入）；
    // 没有或混音失败时退回纯歌曲
    let mixed = false;
    const ttsPath = resolveTtsPath(story?.audioUrl ?? null);
    if (ttsPath) {
      const ttsExists = await access(ttsPath).then(() => true, () => false);
      if (ttsExists) {
        try {
          await mixEpisodeAudio({ ttsPath, musicPath, outputPath });
          mixed = true;
        } catch (err) {
          console.warn(`Mix failed for ${fav.title}, falling back to music only:`, err);
        }
      }
    }

    if (!mixed) {
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
    }

    mixedPaths.push(outputPath);
    showTracks.push({
      title: fav.title,
      artist: fav.artist,
      djStory: story?.text ?? "（当天没有为这首歌生成口播）",
      storyType: story?.storyType ?? "mood-reading"
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
  try {
    await access(zipPath);
    return zipPath;
  } catch {
    return null;
  }
}

export function startExportTask(deps: ExportPipelineDeps): string {
  const id = randomUUID();
  tasks.set(id, { id, status: "pending" });

  (async () => {
    tasks.set(id, { id, status: "running" });
    try {
      const result = await exportToday(deps, (progress) => {
        tasks.set(id, { ...tasks.get(id)!, status: "running", progress });
      });
      tasks.set(id, { id, status: "completed", result });
    } catch (err) {
      const error = err instanceof Error ? err.message : "export failed";
      tasks.set(id, { id, status: "failed", error });
    }
  })();

  return id;
}

export function getExportTask(id: string): ExportTask | undefined {
  return tasks.get(id);
}
