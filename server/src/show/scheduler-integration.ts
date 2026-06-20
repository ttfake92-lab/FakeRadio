import type { ProgramBriefRepository } from "./program-brief-repository.js";
import type { ShowPlanRepository } from "./show-plan-repository.js";
import type { JobRegistry } from "./show-generation-job.js";
import type { ShowProjectRepository } from "./show-project-repository.js";
import type { ShowPlanBlock, Track, RadioEpisode } from "@fakeradio/shared";
import type { LikedSongsRepository } from "../user/liked-songs-repository.js";
import type { LlmAdapter, MusicAdapter, TtsAdapter, StorySourceAdapter, WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../adapters/types.js";
import type { DailyShowPlanGenerator } from "./daily-show-plan-generator.js";
import type { DailySelectionEngine } from "./daily-selection-engine.js";
import { gatherEpisodeSources, narrateStoryWithSources, synthesizeWithFallback } from "../http/episode-runner.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { env } from "../config/env.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

export type SchedulerIntegrationDeps = {
  briefRepo: ProgramBriefRepository;
  planRepo: ShowPlanRepository;
  jobRegistry: JobRegistry;
  showProjectRepo?: ShowProjectRepository;
  dailyShowPlanGenerator?: DailyShowPlanGenerator;
  targetDate: string;
};

export type SchedulerExecutionDeps = {
  briefRepo: ProgramBriefRepository;
  planRepo: ShowPlanRepository;
  showProjectRepo: ShowProjectRepository;
  jobRegistry: JobRegistry;
  llm: LlmAdapter;
  music: MusicAdapter;
  tts: TtsAdapter;
  ttsCacheDir: string;
  weather: WeatherAdapter;
  calendar: CalendarAdapter;
  devices: DeviceAdapter;
  storySource: StorySourceAdapter;
  publicMetadataAdapter: StorySourceAdapter | undefined;
  webResearchAdapter: StorySourceAdapter | undefined;
  likedSongs: LikedSongsRepository;
  systemPrompt: string;
  userPreferences?: { taste: string; routines: string; moodRules: string };
  dailySelectionEngine?: DailySelectionEngine;
};

async function generateEpisodeForBlock(
  deps: SchedulerExecutionDeps,
  block: ShowPlanBlock,
  excludedTrackIds: Set<string>,
  now: Date
): Promise<{ episode: RadioEpisode; track: Track } | { error: string }> {
  const { llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource, publicMetadataAdapter, webResearchAdapter, likedSongs, systemPrompt } = deps;

  const favoritesTracks = await likedSongs.list();
  const uniqueCandidates = favoritesTracks.slice(0, 20);

  const [weatherSnapshot, calendarItems, playbackDevices] = await Promise.all([
    weather.current(),
    calendar.upcoming(),
    devices.list()
  ]);

  const draftDecision = await computeDjDecision({
    llm,
    now,
    systemPrompt,
    userTaste: "",
    routines: "",
    moodRules: "",
    recentMemory: [],
    toolResults: [],
    executionState: `theme-show-block-${block.role}`,
    environment: {
      weather: weatherSnapshot,
      calendar: calendarItems,
      devices: playbackDevices
    },
    candidates: uniqueCandidates
  });

  let track: Track | null = null;
  if (draftDecision.play.trackId) {
    const llmPicked = uniqueCandidates.find((t) => t.id === draftDecision.play.trackId && !excludedTrackIds.has(t.id));
    if (llmPicked) {
      try {
        track = await music.resolve(llmPicked);
      } catch { /* fall through */ }
    }
  }

  if (!track) {
    const searchQueries = buildBlockSearchQueries(block, draftDecision.play.query);
    for (const query of searchQueries) {
      const candidates = await music.search(query);
      const first = candidates.find((t) => !excludedTrackIds.has(t.id));
      if (first) {
        try {
          track = await music.resolve(first);
          break;
        } catch { /* try next query */ }
      }
    }
  }

  if (!track) {
    const recommended = await music.recommend({ mood: block.constraints.moodHint ?? block.selectionGoal, limit: 5 });
    const first = recommended.find((t) => !excludedTrackIds.has(t.id));
    if (first) {
      try {
        track = await music.resolve(first);
      } catch { /* fall through */ }
    }
  }

  if (!track) {
    return { error: `No track available for block ${block.role}: ${block.title}` };
  }

  const sources = await gatherEpisodeSources(
    storySource,
    publicMetadataAdapter,
    webResearchAdapter,
    env.FAKERADIO_BRAVE_API_KEY,
    track
  );

  const { narration, storyType } = await narrateStoryWithSources(
    llm,
    track,
    sources,
    systemPrompt,
    [],
    { weather: weatherSnapshot, calendar: calendarItems, devices: playbackDevices },
    deps.userPreferences?.taste ?? "",
    deps.userPreferences?.routines ?? "",
    deps.userPreferences?.moodRules ?? ""
  );

  const { result: storyTtsResult, fallbackReason } = await synthesizeWithFallback(tts, ttsCacheDir, narration);

  const episode: RadioEpisode = {
    track,
    story: { text: narration, audioUrl: storyTtsResult.audioUrl, type: storyType },
    sources,
    playback: { crossfadeStartOffsetMs: 3000, musicStartVolume: 0.2 },
    fallbackReason
  };

  return { episode, track };
}

function cleanArtistCandidate(raw: string): string {
  return raw
    .replace(/^.*[如选荐：:，,；;]/u, "")
    .replace(/^(一首|多首|标志性|代表性|经典|作品|曲目)\s*/u, "")
    .trim();
}

function buildBlockSearchQueries(block: ShowPlanBlock, draftQuery: string | undefined): string[] {
  const text = [block.selectionGoal, block.title, block.storyGoal].filter(Boolean).join("\n");
  const queries: string[] = [];
  const quotedPattern = /([\p{L}\p{N}\s.'’&+\-]+?)?的?《([^》]+)》/gu;

  for (const match of text.matchAll(quotedPattern)) {
    const artist = match[1] ? cleanArtistCandidate(match[1]) : "";
    const title = match[2]?.trim();
    if (!title) continue;
    queries.push(artist ? `${title} ${artist}` : title);
    queries.push(title);
  }

  queries.push(`${block.title} ${block.selectionGoal}`);
  queries.push(block.selectionGoal);
  if (block.constraints.moodHint) queries.push(`${block.constraints.moodHint} ${block.selectionGoal}`);
  if (draftQuery) queries.push(draftQuery);

  return Array.from(new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean)));
}

async function saveEpisodeToProject(
  projectDir: string,
  blockIndex: number,
  blockRole: string,
  episode: RadioEpisode
): Promise<void> {
  const fileName = `episode-${String(blockIndex).padStart(3, "0")}-${blockRole}.json`;
  await writeFile(join(projectDir, fileName), JSON.stringify(episode, null, 2), "utf-8");
}

export async function executeScheduledJob(
  deps: SchedulerExecutionDeps,
  briefId: string,
  planId: string,
  jobId: string
): Promise<void> {
  const { briefRepo, planRepo, showProjectRepo, jobRegistry } = deps;

  const plans = await planRepo.list({ briefId, activeOnly: true });
  const activePlan = plans[0];
  if (!activePlan) {
    await jobRegistry.addLog(jobId, { level: "error", message: "No active plan found", phase: "execution" });
    await jobRegistry.fail(jobId, "No active plan found");
    return;
  }

  const project = await showProjectRepo.getByBriefId(briefId);
  if (!project) {
    await jobRegistry.addLog(jobId, { level: "error", message: "No project found for brief", phase: "execution" });
    await jobRegistry.fail(jobId, "No project found");
    return;
  }

  const projectDir = project.directoryPath;
  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true });
  }

  await jobRegistry.addLog(jobId, {
    level: "info",
    message: `Starting episode generation for ${activePlan.blocks.length} blocks`,
    phase: "execution"
  });

  const brief = await briefRepo.get(briefId);
  const now = new Date();
  let excludedTrackIds = new Set<string>();

  if (brief?.type === "daily-show" && deps.dailySelectionEngine) {
    await jobRegistry.addLog(jobId, {
      level: "info",
      message: "Using DailySelectionEngine for daily-show (strong recent-play exclusion enabled)",
      phase: "execution"
    });
    const favoritesTracks = await deps.likedSongs.list();
    const externalTracks: Track[] = [];
    const selection = await deps.dailySelectionEngine.selectForPlan(
      activePlan,
      favoritesTracks,
      externalTracks
    );
    const alreadySelected = selection.selections.flatMap((bs) => bs.selections.map((s) => s.track.id));
    excludedTrackIds = new Set([...excludedTrackIds, ...alreadySelected]);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < activePlan.blocks.length; i++) {
    const block = activePlan.blocks[i];
    if (!block) {
      await jobRegistry.addLog(jobId, { level: "error", message: `Block ${i} is undefined`, phase: "execution" });
      failCount++;
      continue;
    }
    const blockLogMsg = `Generating episode ${i + 1}/${activePlan.blocks.length} for block "${block.role}: ${block.title}"`;

    await jobRegistry.addLog(jobId, { level: "info", message: blockLogMsg, phase: "execution" });

    const result = await generateEpisodeForBlock(deps, block, excludedTrackIds, now);

    if ("error" in result) {
      await jobRegistry.addLog(jobId, { level: "error", message: `Block ${i} failed: ${result.error}`, phase: "execution" });
      failCount++;
      continue;
    }

    try {
      await saveEpisodeToProject(projectDir, i, block.role, result.episode);
      excludedTrackIds.add(result.track.id);
      successCount++;

      await jobRegistry.addTrace(jobId, {
        type: "adapter",
        operation: "episode-generated",
        summary: `Block ${i} "${block.role}": "${result.track.title}" by ${result.track.artist}`,
        durationMs: 0,
        success: true
      });

      await jobRegistry.addLog(jobId, {
        level: "info",
        message: `Block ${i} complete: "${result.track.title}" by ${result.track.artist}`,
        phase: "execution"
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await jobRegistry.addLog(jobId, { level: "error", message: `Failed to save block ${i}: ${errorMsg}`, phase: "execution" });
      failCount++;
    }
  }

  if (successCount > 0) {
    await jobRegistry.addLog(jobId, {
      level: "info",
      message: `Episode generation complete: ${successCount} succeeded, ${failCount} failed`,
      phase: "execution"
    });

    await showProjectRepo.update(project.id, { status: "ready" });
    await briefRepo.updateStatus(briefId, "completed");

    const completedJob = await jobRegistry.complete(jobId);
    if (completedJob) {
      await jobRegistry.addLog(jobId, {
        level: "info",
        message: "Job marked as completed",
        phase: "execution"
      });
    }
  } else {
    await jobRegistry.fail(jobId, `All ${activePlan.blocks.length} blocks failed`);
    await briefRepo.updateStatus(briefId, "failed");
  }
}

export async function scheduleTonightBriefIfNeeded(
  integrationDeps: SchedulerIntegrationDeps,
  executionDeps?: SchedulerExecutionDeps
): Promise<void> {
  const { briefRepo, planRepo, jobRegistry, targetDate, dailyShowPlanGenerator } = integrationDeps;

  const briefs = await briefRepo.list({ status: "scheduled", targetDate });

  for (const brief of briefs) {
    let plans = await planRepo.list({ briefId: brief.id, activeOnly: true });
    let activePlan = plans[0];

    if (!activePlan && brief.type === "daily-show" && dailyShowPlanGenerator) {
      const generatedPlan = dailyShowPlanGenerator.generate(brief);
      await planRepo.save(generatedPlan);
      activePlan = generatedPlan;
    }

    if (!activePlan) {
      console.log(`[scheduler] No active plan found for brief ${brief.id}, skipping.`);
      continue;
    }

    const job = await jobRegistry.create({ briefId: brief.id, planId: activePlan.id });

    await jobRegistry.addLog(job.id, {
      level: "info",
      message: `Scheduler triggered job for brief ${brief.id} (${brief.topic ?? brief.type}), target date: ${targetDate}, blocks: ${activePlan.blocks.length}`,
      phase: "scheduler"
    });

    await jobRegistry.start(job.id);

    await jobRegistry.addLog(job.id, {
      level: "info",
      message: `Job transitioned from pending to running (scheduler-initiated)`,
      phase: "scheduler"
    });

    await briefRepo.updateStatus(brief.id, "generating");
    console.log(`[scheduler] Started job ${job.id} for brief ${brief.id} (${brief.topic ?? brief.type})`);

    // 如果提供了执行依赖，则立即执行 job
    if (executionDeps) {
      console.log(`[scheduler] Executing job ${job.id} for brief ${brief.id}...`);
      try {
        await executeScheduledJob(executionDeps, brief.id, activePlan.id, job.id);
        console.log(`[scheduler] Job ${job.id} completed successfully.`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Job ${job.id} failed to execute:`, err);
        await jobRegistry.addLog(job.id, {
          level: "error",
          message: `Job execution failed: ${errorMsg}`,
          phase: "scheduler"
        });
        await jobRegistry.fail(job.id, errorMsg);
      }
    }
  }
}
