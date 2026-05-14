import { writeFile, mkdir, readdir, readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ShowProject, ShowPlan, ShowJob, RadioEpisode, TechTraceEntry } from "@fakeradio/shared";
import { generateShowNotes, type ShowNotesTrack } from "./show-notes-generator.js";
import { checkFfmpegAvailable } from "./audio-mixer.js";
import { redactTechTraceEntry, redactArbitraryEntry } from "../show/production-trace.js";

export type ExportShowProjectDeps = {
  project: ShowProject;
  plan: ShowPlan;
  job: ShowJob;
  includeTrace?: boolean;
  ttsCacheDir?: string;
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

async function concatAudioWithFfmpeg(inputs: { url: string; duration?: number }[], outputPath: string, ttsCacheDir?: string): Promise<number> {
  const { execFile } = await import("node:child_process");
  const listPath = outputPath + ".list.txt";
  const validInputs: string[] = [];

  for (const input of inputs) {
    let resolvedPath: string;
    if (input.url.startsWith("/cache/tts/") && ttsCacheDir) {
      resolvedPath = join(ttsCacheDir, input.url.replace("/cache/tts/", ""));
    } else if (input.url.startsWith("/")) {
      resolvedPath = input.url;
    } else {
      resolvedPath = input.url;
    }

    try {
      await access(resolvedPath);
      validInputs.push(resolvedPath.replace(/'/g, "'\\''"));
    } catch {
      continue;
    }
  }

  if (validInputs.length === 0) {
    return 0;
  }

  const listContent = validInputs.map((f) => `file '${f}'`).join("\n");
  await writeFile(listPath, listContent, "utf-8");

  return new Promise((resolveSize, reject) => {
    execFile("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-codec:a", "libmp3lame", "-b:a", "192k",
      "-ar", "44100", "-ac", "2",
      outputPath
    ], async (error) => {
      try { await access(listPath); await writeFile(listPath, ""); } catch { /* ignore cleanup */ }
      if (error) {
        reject(new Error(`FFmpeg concat failed: ${error.message}`));
      } else {
        try {
          const stat = await import("node:fs/promises").then((fs) => fs.stat(outputPath));
          resolveSize(stat.size);
        } catch {
          resolveSize(0);
        }
      }
    });
  });
}

export async function exportShowProject(
  deps: ExportShowProjectDeps
): Promise<ExportShowProjectResult> {
  const { project, plan, job, includeTrace = true, ttsCacheDir } = deps;

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
    const audioSegments = episodes.flatMap((ep) => {
      const segments: { url: string; duration?: number }[] = [];
      if (ep.story?.audioUrl) {
        segments.push({ url: ep.story.audioUrl });
      }
      if (ep.track?.audioUrl) {
        segments.push({ url: ep.track.audioUrl });
      }
      return segments;
    });
    if (audioSegments.length === 0) {
      throw new Error("无法生成音频：未找到任何可拼接的音频片段（story 或 track 均无 audioUrl）");
    }
    if (!hasFfmpeg) {
      throw new Error("无法生成音频：FFmpeg 未安装，无法拼接音频片段");
    }
    showMp3Size = await concatAudioWithFfmpeg(audioSegments, showMp3Path, ttsCacheDir);
    if (showMp3Size === 0) {
      throw new Error("无法生成音频：FFmpeg 拼接失败，产出文件为空（请检查音频片段路径是否可访问）");
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
