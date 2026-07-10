import type { ProgramBriefRepository } from "./program-brief-repository.js";
import type { ShowPlanRepository } from "./show-plan-repository.js";
import type { JobRegistry } from "./show-generation-job.js";
import type { ShowProjectRepository } from "./show-project-repository.js";
import type { ShowPlanBlock, ShowPlan, Track, RadioEpisode } from "@fakeradio/shared";
import type { LikedSongsRepository } from "../user/liked-songs-repository.js";
import type { LlmAdapter, MusicAdapter, TtsAdapter, StorySourceAdapter, WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../adapters/types.js";
import type { DailyShowPlanGenerator } from "./daily-show-plan-generator.js";
import type { DailySelectionEngine } from "./daily-selection-engine.js";
import { composeEpisodeFromTrack, type ComposeEpisodeDeps, type ShowPlanNarrationContext } from "../http/episode-runner.js";
import { computeDjDecision } from "../brain/dj-brain.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { classifyShowTopic, type ShowTopicClassification } from "./classify-show-topic.js";

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

// 把"陈奕迅"匹配进 t.artist 字段。简单 substring (双向都查),不强求大小写完全一致。
// 多艺术家用 / 或 、 或 , 隔开 -> 拆开逐个比, 跟 anchors 任意一项命中即可。
function trackMatchesAnchors(track: Track, anchors: string[]): boolean {
  if (anchors.length === 0) return false;
  const artistParts = track.artist
    .split(/[\/、,，&+×x]\s*|\s+feat\.?\s+/iu)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const anchorsLower = anchors.map((a) => a.trim().toLowerCase()).filter(Boolean);
  for (const part of artistParts) {
    for (const anchor of anchorsLower) {
      if (part === anchor) return true;
      if (part.includes(anchor) || anchor.includes(part)) return true;
    }
  }
  return false;
}

async function generateEpisodeForBlock(
  deps: SchedulerExecutionDeps,
  block: ShowPlanBlock,
  excludedTrackIds: Set<string>,
  now: Date,
  topicClassification: ShowTopicClassification,
  plan: ShowPlan,
  blockIndex: number,
  briefTopic: string | undefined
): Promise<{ episode: RadioEpisode; track: Track } | { error: string }> {
  const { llm, music, tts, ttsCacheDir, weather, calendar, devices, storySource, publicMetadataAdapter, webResearchAdapter, likedSongs, systemPrompt } = deps;

  const allFavorites = await likedSongs.list();
  const isStrictTopic = (topicClassification.kind === "artist" || topicClassification.kind === "album")
    && topicClassification.anchors.length > 0;

  let track: Track | null = null;

  // ─── 第一层 (优先级最高): 段落里点名《歌名》的精准搜索 ─────────────────
  //
  // 之前的实现里第一层是 computeDjDecision -- LLM 从 favorites 池里挑一首,
  // 但 LLM 看不到 block.selectionGoal 的具体内容 (只拿到 "theme-show-block-opening"
  // 这种 role 字符串), 所以每个 block 都按"热门" 挑同样的歌, 跟编排无关。
  // 用户报告"导出的节目不按编排走" -- 根因就是 selectionGoal 在第一层被忽略了。
  //
  // 改为: 直接用 buildBlockSearchQueries 解析 selectionGoal/storyGoal 里的《歌名》,
  // 按"主题艺术家 + 歌名"精准搜索, 命中即用。这样"《K歌之王》→《浮夸》"那条 block
  // 就能拿到《K歌之王》, "《好久不见》收尾"那条能拿到《好久不见》。
  const searchQueries = buildBlockSearchQueries(block, undefined, topicClassification);
  for (const query of searchQueries) {
    const candidates = await music.search(query);
    const filtered = isStrictTopic
      ? candidates.filter((t) => trackMatchesAnchors(t, topicClassification.anchors))
      : candidates;
    const first = filtered.find((t) => !excludedTrackIds.has(t.id));
    if (first) {
      try {
        track = await music.resolve(first);
        break;
      } catch { /* try next query */ }
    }
  }

  // ─── 第二层: 主题艺术家的 favorites 子集 ─────────────────────────────
  //
  // search 没召回时, 看用户 favorites 里有没有这个艺术家的歌。
  // artist 类型时优先该艺术家; style/mood/none 时用整池。
  if (!track) {
    const themedFavorites = isStrictTopic
      ? allFavorites.filter((t) => trackMatchesAnchors(t, topicClassification.anchors))
      : [];
    const candidatePool = themedFavorites.length > 0 ? themedFavorites : allFavorites;
    const uniqueCandidates = candidatePool.slice(0, 20);

    if (uniqueCandidates.length > 0) {
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
        executionState: `theme-show-block-${block.role}: ${block.title} | goal: ${block.selectionGoal}`,
        environment: {
          weather: weatherSnapshot,
          calendar: calendarItems,
          devices: playbackDevices
        },
        candidates: uniqueCandidates
      });

      if (draftDecision.play.trackId) {
        const llmPicked = uniqueCandidates.find((t) => t.id === draftDecision.play.trackId && !excludedTrackIds.has(t.id));
        if (llmPicked) {
          try {
            track = await music.resolve(llmPicked);
          } catch { /* fall through */ }
        }
      }
    }
  }

  // ─── 第三层: music.recommend 兜底 ─────────────────────────────────
  // 主题=艺术家时,recommend mood 用艺术家名做种子词,且对返回结果再做一次硬过滤。
  if (!track) {
    const recommendMood = isStrictTopic
      ? topicClassification.anchors.join(" ")
      : (block.constraints.moodHint ?? block.selectionGoal);
    const recommended = await music.recommend({ mood: recommendMood, limit: 10 });
    const filtered = isStrictTopic
      ? recommended.filter((t) => trackMatchesAnchors(t, topicClassification.anchors))
      : recommended;
    const first = filtered.find((t) => !excludedTrackIds.has(t.id));
    if (first) {
      try {
        track = await music.resolve(first);
      } catch { /* fall through */ }
    }
  }

  // 最后的兜底: artist/album 强约束如果上面三层都没命中, 给一次"丢弃约束"的机会,
  // 否则单块就直接失败、整期节目都凑不齐。日志里告知用户主题艺术家命中不足。
  if (!track && isStrictTopic) {
    console.warn(`[show-gen] block "${block.role}" no track matched topic anchors ${JSON.stringify(topicClassification.anchors)} — falling back to non-topic search`);
    const fallbackQueries = buildBlockSearchQueries(block, undefined, { kind: "none", anchors: [] });
    for (const query of fallbackQueries) {
      const candidates = await music.search(query);
      const first = candidates.find((t) => !excludedTrackIds.has(t.id));
      if (first) {
        try {
          track = await music.resolve(first);
          break;
        } catch { /* try next */ }
      }
    }
  }

  // 终极兜底: search/recommend/resolve 全军覆没 (常见原因是 NeteaseCloudMusicApi
  // 登录失效, /cloudsearch 解密报错返回空)。直接从用户 favorites 全集挑一首未排除的歌,
  // 这个路径不依赖网络搜索, 只要 cookie 还能 resolve audioUrl 就行。
  // 比"块失败"好得多 -- 节目至少能凑齐, 用户能感受到失败原因 (歌曲与主题不强相关)。
  if (!track) {
    for (const candidate of allFavorites) {
      if (excludedTrackIds.has(candidate.id)) continue;
      try {
        track = await music.resolve(candidate);
        console.warn(`[show-gen] block "${block.role}" using favorites fallback: ${candidate.title} by ${candidate.artist}`);
        break;
      } catch { /* try next favorite */ }
    }
  }

  if (!track) {
    return { error: `No track available for block ${block.role}: ${block.title}` };
  }

  const composeDeps: ComposeEpisodeDeps = {
    llm, tts, ttsCacheDir, storySource,
    publicMetadataAdapter, webResearchAdapter,
    weather, calendar, devices, systemPrompt,
    // 主题节目是持久化产物：TTS 失败让该 block 走 error 路径记 failed，
    // 不允许把 macOS say 兜底音频烘进节目文件。
    audibleTtsFallback: false
  };

  // 组装节目编排上下文: 让 LLM 写口播时知道这一集在"整期剧本"里的位置 + 叙事弧。
  // 主题(briefTopic)未设置时退化为 plan.briefSnapshot.topic 或留空。
  // 整期纲要列出来作为剧本"目录",让 LLM 在写第 3 段时能看到第 1/2/4/5...段在讲什么。
  const topicForNarration = briefTopic ?? plan.briefSnapshot?.topic ?? "";
  const allBlocksOutline = plan.blocks
    .map((b, idx) => `  ${idx + 1}. [${b.role}] ${b.title} — ${b.storyGoal}`)
    .join("\n");
  const prevBlock = blockIndex > 0 ? plan.blocks[blockIndex - 1] : undefined;
  const nextBlock = blockIndex + 1 < plan.blocks.length ? plan.blocks[blockIndex + 1] : undefined;

  const showPlanContext: ShowPlanNarrationContext = {
    topic: topicForNarration,
    currentBlockIndex: blockIndex,
    totalBlocks: plan.blocks.length,
    currentBlockRole: block.role,
    currentBlockTitle: block.title,
    currentBlockStoryGoal: block.storyGoal,
    ...(prevBlock ? { previousBlock: { role: prevBlock.role, title: prevBlock.title } } : {}),
    ...(nextBlock ? { nextBlock: { role: nextBlock.role, title: nextBlock.title } } : {}),
    allBlocksOutline
  };

  try {
    const { episode } = await composeEpisodeFromTrack(track, composeDeps, {
      recentMemory: [],
      taste: deps.userPreferences?.taste ?? "",
      routines: deps.userPreferences?.routines ?? "",
      moodRules: deps.userPreferences?.moodRules ?? "",
      showPlanContext
    });
    return { episode, track };
  } catch (err) {
    // compose 抛错（如 TTS 失败且本路径禁用 say 兜底）只让该 block 失败，
    // 不炸掉整个 show job——外层循环对 { error } 有 failCount 处理。
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Block ${block.role} compose failed: ${message}` };
  }
}

function cleanArtistCandidate(raw: string): string {
  return raw
    .replace(/^.*[如选荐：:，,；;]/u, "")
    .replace(/^(一首|多首|标志性|代表性|经典|作品|曲目)\s*/u, "")
    .trim();
}

function buildBlockSearchQueries(
  block: ShowPlanBlock,
  draftQuery: string | undefined,
  topic: ShowTopicClassification
): string[] {
  const text = [block.selectionGoal, block.title, block.storyGoal].filter(Boolean).join("\n");
  const queries: string[] = [];
  const quotedPattern = /([\p{L}\p{N}\s.'’&+\-]+?)?的?《([^》]+)》/gu;

  // 段落里点名的具体歌名: 一定先放进去。
  // 当主题是 artist 类型时,把"主题艺术家 + 歌名"也排进前面,提高 search 召回精度。
  const isStrictTopic = topic.kind === "artist" || topic.kind === "album";
  const primaryAnchor = topic.anchors[0]?.trim();

  for (const match of text.matchAll(quotedPattern)) {
    const artistFromText = match[1] ? cleanArtistCandidate(match[1]) : "";
    const title = match[2]?.trim();
    if (!title) continue;
    // 优先级: 主题艺术家+歌名 > 段落里指的艺术家+歌名 > 单歌名。
    if (isStrictTopic && primaryAnchor) {
      queries.push(`${primaryAnchor} ${title}`);
    }
    if (artistFromText) queries.push(`${title} ${artistFromText}`);
    queries.push(title);
  }

  // 主题=艺术家时,加上"艺术家 + 段落标题/目标"这类查询,
  // 用于段落没显式点名具体歌、但有方向感时召回该艺术家的相关作品。
  if (isStrictTopic && primaryAnchor) {
    queries.push(primaryAnchor);  // 单独搜艺术家名 -> 大概率拿到代表作
    queries.push(`${primaryAnchor} ${block.title}`);
    queries.push(`${primaryAnchor} ${block.selectionGoal}`);
    if (block.constraints.moodHint) {
      queries.push(`${primaryAnchor} ${block.constraints.moodHint}`);
    }
    // 把所有别名也试一遍 (中英文)。
    for (const alias of topic.anchors.slice(1)) {
      queries.push(alias);
      queries.push(`${alias} ${block.title}`);
    }
  } else if (topic.kind === "style" || topic.kind === "mood") {
    // style/mood 类型: 用 anchors 做辅助召回, 不做 artist 过滤。
    for (const anchor of topic.anchors) {
      queries.push(`${anchor} ${block.selectionGoal}`);
      queries.push(anchor);
    }
  }

  // 原 fallback 查询: 段落字面信息。
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

  // 在 block 循环外做一次主题分类: 整期节目共用,避免每个 block 多调用一次 LLM。
  // brief.topic="陈奕迅" -> {kind:"artist", anchors:["陈奕迅","Eason Chan"]}
  // 选歌时 artist/album 类型走硬过滤, style/mood 走 query 前缀辅助召回。
  const topicClassification = await classifyShowTopic(deps.llm, brief?.topic, deps.music);
  await jobRegistry.addLog(jobId, {
    level: "info",
    message: `Show topic classified: kind=${topicClassification.kind} anchors=${JSON.stringify(topicClassification.anchors)} (from "${brief?.topic ?? "(none)"}")`,
    phase: "execution"
  });

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

    const result = await generateEpisodeForBlock(deps, block, excludedTrackIds, now, topicClassification, activePlan, i, brief?.topic);

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
