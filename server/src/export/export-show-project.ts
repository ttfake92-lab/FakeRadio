import { writeFile, mkdir, readdir, readFile, access, unlink } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { join, resolve } from "node:path";
import type { ShowProject, ShowPlan, ShowJob, RadioEpisode, TechTraceEntry, Track } from "@fakeradio/shared";
import { generateShowNotes, type ShowNotesTrack } from "./show-notes-generator.js";
import { checkFfmpegAvailable, mixEpisodeAudio } from "./audio-mixer.js";
import { redactTechTraceEntry, redactArbitraryEntry } from "../show/production-trace.js";
import type { TrackRegistry } from "../audio/track-registry.js";
import { getAudioFilePath, isAudioRecorded } from "../audio/audio-recorder.js";
import type { MusicAdapter } from "../adapters/types.js";

export type ExportShowProjectDeps = {
  project: ShowProject;
  plan: ShowPlan;
  job: ShowJob;
  includeTrace?: boolean;
  ttsCacheDir?: string;
  // 解析 episode 里的 track 对应的本地音乐文件。
  // 与 exportToday 对齐: 不依赖 episode JSON 里那串可能过期的远端 audioUrl,
  // 而是按 trackId 在 audioDir 里找下载好的 mp3。
  trackRegistry?: TrackRegistry;
  audioDir?: string;
  // mp3 不在本地时, 用 music adapter 重新 resolve+下载一次。
  // 后台 worker 生成的 episode 用户没在播放器里播过 —— 第一次导出时本地一定没缓存。
  music?: MusicAdapter;
};

export type ExportShowProjectResult = {
  downloadUrl: string;
  projectId: string;
  date: string;
  blocksCount: number;
  showMp3Size?: number;
};

async function collectEpisodes(project: ShowProject): Promise<RadioEpisode[]> {
  const episodes: RadioEpisode[] = [];
  const dir = project.directoryPath;

  if (dir) {
    try {
      const files = await readdir(dir);
      const episodeFiles = files.filter((f) => f.startsWith("episode-") && f.endsWith(".json"));
      episodeFiles.sort();
      for (const file of episodeFiles) {
        const content = await readFile(join(dir, file), "utf-8");
        const ep = JSON.parse(content) as RadioEpisode;
        if (ep?.track) {
          episodes.push(ep);
        }
      }
    } catch {
    }
  }

  return episodes;
}

function collectShowNotesTracks(episodes: RadioEpisode[]): ShowNotesTrack[] {
  return episodes.map((ep) => {
    const track: ShowNotesTrack = {
      title: ep.track.title,
      artist: ep.track.artist,
      djStory: ep.story?.text ?? "",
      storyType: (ep.story?.type as ShowNotesTrack["storyType"]) ?? "background",
    };
    if (ep.track.album) track.album = ep.track.album;
    if ((ep as Record<string, unknown>).external) {
      track.externalTrack = (ep as Record<string, unknown>).external as boolean;
    }
    if ((ep as Record<string, unknown>).externalReason) {
      track.externalReason = (ep as Record<string, unknown>).externalReason as string;
    }
    return track;
  });
}

// 把多个已经归一化的 mp3 段(192k/44100/stereo) 用 concat demuxer 串成最终 show.mp3。
// 输入文件必须在 codec/sr/ch 上一致，才能用 -c copy 无损快拼。
async function concatNormalizedSegments(inputs: string[], outputPath: string): Promise<number> {
  const { execFile } = await import("node:child_process");
  const listPath = outputPath + ".list.txt";
  const listContent = inputs
    .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, listContent, "utf-8");

  return new Promise((resolveSize, reject) => {
    execFile("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-codec:a", "copy",
      outputPath,
    ], async (error) => {
      try { await unlink(listPath); } catch { /* ignore cleanup */ }
      if (error) {
        reject(new Error(`FFmpeg concat failed: ${error.message}`));
        return;
      }
      try {
        const stat = await import("node:fs/promises").then((fs) => fs.stat(outputPath));
        resolveSize(stat.size);
      } catch {
        resolveSize(0);
      }
    });
  });
}

// 把单条歌曲转成与 mixEpisodeAudio 同样的归一化格式(libmp3lame/192k/44100/stereo),
// 用于"没有口播音频"的 episode —— 避免 concat 时编码不一致导致拼不起来。
async function normalizeMusic(musicPath: string, outputPath: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolveNorm, reject) => {
    execFile("ffmpeg", [
      "-y", "-i", musicPath,
      "-codec:a", "libmp3lame", "-b:a", "192k",
      "-ar", "44100", "-ac", "2",
      outputPath,
    ], (err) => err ? reject(new Error(`FFmpeg normalize failed: ${err.message}`)) : resolveNorm());
  });
}

// /cache/tts/<file> 这种 URL 解析成磁盘绝对路径; 已是绝对路径直接返回。
// 返回 null 表示这条 URL 不能被定位到本地文件。
function resolveAudioPath(audioUrl: string | null | undefined, ttsCacheDir?: string): string | null {
  if (!audioUrl) return null;
  if (audioUrl.startsWith("/cache/tts/") && ttsCacheDir) {
    return join(ttsCacheDir, audioUrl.slice("/cache/tts/".length));
  }
  if (audioUrl.startsWith("/")) return audioUrl;
  return audioUrl;
}

// 把一首歌的本地 mp3 路径拿出来,本地没有就按需下载一次。
// episode JSON 里的 track.audioUrl 是 Netease 远端 URL 且常常已过期,
// 不能直接拿去给 ffmpeg。统一走 trackRegistry+audioDir,跟播放/今日导出对齐。
async function resolveMusicPath(
  track: Track,
  audioDir: string,
  registry: TrackRegistry,
  music: MusicAdapter | undefined
): Promise<string | null> {
  const localPath = getAudioFilePath(audioDir, track.id);
  if (isAudioRecorded(audioDir, track.id)) return localPath;

  // 注册一下,后续刷新拿到的最新 URL 能存进 registry 里被其它流程复用。
  // worker 生成的 episode 用户从未播过 -> registry 里此前不存在这首歌。
  registry.register(track);

  // 本地没缓存 -> 拿一个可用的远端 URL (可能要刷新)。
  let resolvedTrack = registry.get(track.id) ?? track;
  if (!resolvedTrack.audioUrl && music) {
    try {
      resolvedTrack = await music.resolve(track);
      registry.register(resolvedTrack);
    } catch {
      return null;
    }
  }
  if (!resolvedTrack.audioUrl) return null;

  try {
    const downloaded = await downloadToFile(resolvedTrack.audioUrl, localPath);
    if (downloaded) return localPath;

    // 第一次失败可能是 URL 过期 (403),给 music adapter 一次刷新机会。
    if (music) {
      try {
        const refreshed = await music.resolve(resolvedTrack);
        if (refreshed.audioUrl && refreshed.audioUrl !== resolvedTrack.audioUrl) {
          registry.register(refreshed);
          const retry = await downloadToFile(refreshed.audioUrl, localPath);
          if (retry) return localPath;
        }
      } catch {
        return null;
      }
    }
    return null;
  } catch (err) {
    console.warn(`[export] download failed for ${track.id} (${track.title}):`, err);
    return null;
  }
}

async function downloadToFile(url: string, outputPath: string): Promise<boolean> {
  const controller = new AbortController();
  // 连接阶段超时 30s;响应体由 pipeline 自己流式落盘,不受这个 timeout 约束。
  const connectTimer = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(connectTimer);
  }
  if (!response.ok || !response.body) return false;

  const contentType = response.headers.get("content-type") ?? "";
  const isAudio = contentType.startsWith("audio/") || contentType.includes("mpeg") || contentType.includes("mp3");
  if (!isAudio) return false;

  await mkdir(join(outputPath, ".."), { recursive: true });
  const fileStream = createWriteStream(outputPath);
  await pipeline(response.body as unknown as Readable, fileStream);
  return true;
}

export async function exportShowProject(
  deps: ExportShowProjectDeps
): Promise<ExportShowProjectResult> {
  const { project, plan, job, includeTrace = true, ttsCacheDir, trackRegistry, audioDir, music } = deps;

  if (job.status !== "completed") {
    throw new Error("节目尚未完成生成，无法导出");
  }

  const baseDir = project.directoryPath;
  await mkdir(baseDir, { recursive: true });

  await writeFile(
    join(baseDir, "show-plan.json"),
    JSON.stringify(plan, null, 2),
    "utf-8"
  );

  const episodes = await collectEpisodes(project);
  const showNotesTracks = await collectShowNotesTracks(episodes);

  const dateSlug = project.slug.split("-").slice(0, 3).join("-");
  const notesContent = generateShowNotes({
    date: dateSlug,
    tracks: showNotesTracks,
    showPlan: plan,
  });
  await writeFile(join(baseDir, "show-notes.md"), notesContent, "utf-8");

  let showMp3Size = 0;
  const showMp3Path = join(baseDir, "show.mp3");

  if (project.showAudioPath && existsSync(project.showAudioPath)) {
    const audioContent = await readFile(project.showAudioPath);
    await writeFile(showMp3Path, audioContent);
    showMp3Size = audioContent.length;
  } else if (episodes.length > 0) {
    const hasFfmpeg = await checkFfmpegAvailable();
    if (!hasFfmpeg) {
      throw new Error("无法生成音频：FFmpeg 未安装，无法拼接音频片段");
    }

    // 逐 episode 混音(口播压在歌曲前奏上 + 3 秒渐入)或归一化(仅音乐),
    // 再用 concat -c copy 串成最终 show.mp3。
    // 这条路径取代了原先的纯 concat -- 老路径会让口播和音乐同时全音量重叠。
    const segmentPaths: string[] = [];
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i]!;

      // 音乐: 优先按 trackId 找本地 mp3 (没有就按需下载);
      // 没有 trackRegistry/audioDir 时退化回老逻辑 (兼容测试)。
      let musicPath: string | null = null;
      if (ep.track && trackRegistry && audioDir) {
        musicPath = await resolveMusicPath(ep.track, audioDir, trackRegistry, music);
      } else {
        musicPath = resolveAudioPath(ep.track?.audioUrl ?? null, ttsCacheDir);
      }
      const ttsPath = resolveAudioPath(ep.story?.audioUrl ?? null, ttsCacheDir);

      const segmentOut = join(baseDir, `segment-${String(i).padStart(3, "0")}.mp3`);
      let segmentWritten = false;

      if (musicPath && ttsPath) {
        const [musicOk, ttsOk] = await Promise.all([
          access(musicPath).then(() => true, () => false),
          access(ttsPath).then(() => true, () => false),
        ]);
        if (musicOk && ttsOk) {
          try {
            await mixEpisodeAudio({ ttsPath, musicPath, outputPath: segmentOut });
            segmentWritten = true;
          } catch (err) {
            console.warn(`[export] mix failed for ${ep.track.title}, falling back to music-only:`, err);
          }
        }
      }

      if (!segmentWritten && musicPath) {
        const musicOk = await access(musicPath).then(() => true, () => false);
        if (musicOk) {
          try {
            await normalizeMusic(musicPath, segmentOut);
            segmentWritten = true;
          } catch (err) {
            console.warn(`[export] normalize failed for ${ep.track.title}:`, err);
          }
        }
      }

      if (segmentWritten) {
        segmentPaths.push(segmentOut);
      } else {
        console.warn(`[export] no usable audio for ${ep.track?.title ?? "(unknown)"} — skipping`);
      }
    }

    if (segmentPaths.length === 0) {
      throw new Error(
        "无法生成音频：所有 episode 的音乐文件都未能定位到本地 (mp3 不在缓存里且按需下载失败)。" +
        "请先在播放器里播过这些歌一遍,或检查网络/网易云登录状态。"
      );
    }

    if (segmentPaths.length === 1) {
      const single = await readFile(segmentPaths[0]!);
      await writeFile(showMp3Path, single);
      showMp3Size = single.length;
    } else {
      showMp3Size = await concatNormalizedSegments(segmentPaths, showMp3Path);
    }

    if (showMp3Size === 0) {
      throw new Error("无法生成音频：FFmpeg 拼接失败，产出文件为空（请检查音频片段路径是否可访问）");
    }

    // 清理 segment-*.mp3 中间文件,只保留最终 show.mp3
    for (const seg of segmentPaths) {
      try { await unlink(seg); } catch { /* ignore */ }
    }
  }

  if (includeTrace) {
    const allTraceEntries: Array<Record<string, unknown> | TechTraceEntry> = [];
    
    const projectTracePath = join(baseDir, "production-trace.jsonl");
    if (existsSync(projectTracePath)) {
      const existingTrace = await readFile(projectTracePath, "utf-8");
      const lines = existingTrace.split("\n").filter(line => line.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          allTraceEntries.push(redactArbitraryEntry(entry));
        } catch {
        }
      }
    }
    
    if (job.trace && job.trace.length > 0) {
      for (const entry of job.trace) {
        allTraceEntries.push(redactTechTraceEntry(entry));
      }
    }
    
    if (allTraceEntries.length > 0) {
      const traceContent = allTraceEntries
        .map((entry) => JSON.stringify(entry))
        .join("\n");
      await writeFile(
        join(baseDir, "production-trace.jsonl"),
        traceContent + "\n",
        "utf-8"
      );
    }
  }

  const downloadUrl = `/api/export/project/${project.id}`;

  return {
    downloadUrl,
    projectId: project.id,
    date: dateSlug,
    blocksCount: plan.blocks.length,
    showMp3Size,
  };
}
