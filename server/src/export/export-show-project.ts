import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ShowProject, ShowPlan, ShowJob } from "@fakeradio/shared";
import { generateShowNotes, type ShowNotesTrack } from "./show-notes-generator.js";

export type ExportShowProjectDeps = {
  project: ShowProject;
  plan: ShowPlan;
  job: ShowJob;
  includeTrace?: boolean;
};

export type ExportShowProjectResult = {
  downloadUrl: string;
  projectId: string;
  date: string;
  blocksCount: number;
};

async function collectEpisodeTracks(plan: ShowPlan): Promise<ShowNotesTrack[]> {
  const tracks: ShowNotesTrack[] = [];
  const dir = plan.briefSnapshot?.targetDate
    ? join("user/shows", plan.briefSnapshot.targetDate)
    : null;

  if (dir) {
    try {
      const files = await readdir(dir);
      const episodeFiles = files.filter((f) => f.startsWith("episode-") && f.endsWith(".json"));
      for (const file of episodeFiles) {
        const content = await readFile(join(dir, file), "utf-8");
        const ep = JSON.parse(content);
        if (ep?.track) {
          tracks.push({
            title: ep.track.title,
            artist: ep.track.artist,
            album: ep.track.album,
            djStory: ep.story?.text ?? "",
            storyType: (ep.story?.type as ShowNotesTrack["storyType"]) ?? "background",
            externalTrack: ep.external ?? false,
            externalReason: ep.externalReason,
          });
        }
      }
    } catch {
    }
  }

  return tracks;
}

export async function exportShowProject(
  deps: ExportShowProjectDeps
): Promise<ExportShowProjectResult> {
  const { project, plan, job, includeTrace = true } = deps;

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

  const showNotesTracks = await collectEpisodeTracks(plan);

  const dateSlug = project.slug.split("-").slice(0, 3).join("-");
  const notesContent = generateShowNotes({
    date: dateSlug,
    tracks: showNotesTracks,
    showPlan: plan,
  });
  await writeFile(join(baseDir, "show-notes.md"), notesContent, "utf-8");

  if (includeTrace && job.trace && job.trace.length > 0) {
    const traceContent = job.trace
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    await writeFile(
      join(baseDir, "production-trace.jsonl"),
      traceContent + "\n",
      "utf-8"
    );
  }

  const downloadUrl = `/api/export/project/${project.id}`;

  return {
    downloadUrl,
    projectId: project.id,
    date: dateSlug,
    blocksCount: plan.blocks.length,
  };
}
