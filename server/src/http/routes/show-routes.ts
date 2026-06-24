import { z } from "zod";
import {
  BriefsListResponseSchema,
  BriefResponseSchema,
  ShowPlansListResponseSchema,
  ShowPlanResponseSchema,
  ShowJobsListResponseSchema,
  ShowJobResponseSchema,
  StartJobRequestSchema,
  GenerateNowRequestSchema,
  GenerateNowResponseSchema,
  ScheduleTonightRequestSchema,
  ScheduleTonightResponseSchema,
  AddConstraintsRequestSchema,
  ShowProjectsListResponseSchema,
  ShowProjectResponseSchema,
  type ProgramBrief
} from "@fakeradio/shared";
import type { FastifyInstance } from "fastify";
import type { LlmAdapter, MusicAdapter, TtsAdapter, StorySourceAdapter, WeatherAdapter, CalendarAdapter, DeviceAdapter } from "../../adapters/types.js";
import type { ProgramBriefRepository } from "../../show/program-brief-repository.js";
import type { ShowPlanRepository } from "../../show/show-plan-repository.js";
import type { ShowPlanGenerator } from "../../show/show-plan-generator.js";
import type { DailyShowPlanGenerator } from "../../show/daily-show-plan-generator.js";
import type { JobRegistry } from "../../show/show-generation-job.js";
import type { ShowProjectRepository } from "../../show/show-project-repository.js";
import type { LikedSongsRepository } from "../../user/liked-songs-repository.js";
import type { UserPreferences } from "../../user/load-user-preference.js";
import { executeScheduledJob, type SchedulerExecutionDeps } from "../../show/scheduler-integration.js";
import { formatRadioDate } from "../../utils/time.js";

type ShowRouteDeps = {
  app: FastifyInstance;
  programBriefRepo: ProgramBriefRepository;
  showPlanRepo: ShowPlanRepository;
  showProjectRepo: ShowProjectRepository;
  jobRegistry: JobRegistry;
  showPlanGenerator: ShowPlanGenerator;
  dailyShowPlanGenerator: DailyShowPlanGenerator;
  nowProvider: () => Date;
  userPreferences: UserPreferences;
  // executeScheduledJob 执行依赖
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
};

const NeedsReplanBodySchema = z.object({
  reason: z.string().optional()
}).strict();

function buildExecutionDeps(deps: ShowRouteDeps): SchedulerExecutionDeps {
  return {
    briefRepo: deps.programBriefRepo,
    planRepo: deps.showPlanRepo,
    showProjectRepo: deps.showProjectRepo,
    jobRegistry: deps.jobRegistry,
    llm: deps.llm,
    music: deps.music,
    tts: deps.tts,
    ttsCacheDir: deps.ttsCacheDir,
    weather: deps.weather,
    calendar: deps.calendar,
    devices: deps.devices,
    storySource: deps.storySource,
    publicMetadataAdapter: deps.publicMetadataAdapter,
    webResearchAdapter: deps.webResearchAdapter,
    likedSongs: deps.likedSongs,
    systemPrompt: deps.systemPrompt,
    userPreferences: deps.userPreferences
  };
}

// 根据 brief 类型选 plan 生成器：daily-show 用纯模板，其余用 LLM
async function generateActivePlan(deps: ShowRouteDeps, brief: ProgramBrief) {
  const plans = await deps.showPlanRepo.list({ briefId: brief.id, activeOnly: true });
  const existing = plans[0];
  if (existing) return existing;
  const draftPlan = brief.type === "daily-show"
    ? await deps.dailyShowPlanGenerator.generate(brief)
    : await deps.showPlanGenerator.generate(brief, deps.userPreferences.taste);
  return deps.showPlanRepo.save(draftPlan);
}

export function registerShowRoutes(deps: ShowRouteDeps) {
  const { app, programBriefRepo, showPlanRepo, showProjectRepo, jobRegistry, showPlanGenerator, nowProvider } = deps;

  app.get("/api/briefs", async (_request, reply) => {
    const briefs = await programBriefRepo.list();
    return reply.send(BriefsListResponseSchema.parse({ briefs }));
  });

  app.get("/api/briefs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const brief = await programBriefRepo.get(id);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }
    return reply.send(BriefResponseSchema.parse({ brief }));
  });

  app.get("/api/plans", async (request, reply) => {
    const { briefId } = request.query as { briefId?: string };
    const plans = await showPlanRepo.list(briefId ? { briefId } : undefined);
    return reply.send(ShowPlansListResponseSchema.parse({ plans }));
  });

  app.get("/api/plans/:briefId", async (request, reply) => {
    const { briefId } = request.params as { briefId: string };
    const plans = await showPlanRepo.list({ briefId, activeOnly: false });
    return reply.send(ShowPlansListResponseSchema.parse({ plans }));
  });

  app.get("/api/plans/:briefId/active", async (request, reply) => {
    const { briefId } = request.params as { briefId: string };
    const plans = await showPlanRepo.list({ briefId, activeOnly: true });
    const activePlan = plans[0];
    if (!activePlan) {
      return reply.status(404).send({ error: "no active plan found for this brief" });
    }
    return reply.send(ShowPlanResponseSchema.parse({ plan: activePlan }));
  });

  app.post("/api/plans/add-constraints", async (request, reply) => {
    const body = AddConstraintsRequestSchema.parse(request.body);
    const planId = body.planId;
    const constraints = body.constraints;

    const existingPlan = await showPlanRepo.get(planId);
    if (!existingPlan) {
      return reply.status(404).send({ error: "plan not found" });
    }

    const brief = await programBriefRepo.get(existingPlan.briefId);
    const newPlan = await showPlanGenerator.generateFromPlan(
      existingPlan,
      brief ?? existingPlan.briefSnapshot,
      constraints as { preferEra?: string; avoidExplicit?: boolean; moodHint?: string } ?? {}
    );

    await showPlanRepo.save(newPlan);

    return reply.send({ plan: newPlan });
  });

  app.post("/api/jobs", async (request, reply) => {
    const body = StartJobRequestSchema.parse(request.body);
    const job = await jobRegistry.create({ briefId: body.briefId, planId: body.planId });
    await jobRegistry.addLog(job.id, { level: "info", message: "Job created", phase: "init" });
    return reply.status(201).send(ShowJobResponseSchema.parse({ job }));
  });

  app.get("/api/jobs", async (request, reply) => {
    const { briefId } = request.query as { briefId?: string };
    const jobs = await jobRegistry.list(briefId ? { briefId } : undefined);
    return reply.send(ShowJobsListResponseSchema.parse({ jobs }));
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.get(id);
    if (!job) {
      return reply.status(404).send({ error: "job not found" });
    }
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/start", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingJob = await jobRegistry.get(id);
    if (!existingJob) {
      return reply.status(400).send({ error: "cannot start job (not found)" });
    }

    const wasNeedsReplan = existingJob.status === "needs-replan";
    const job = await jobRegistry.start(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot start job (invalid state transition)" });
    }

    if (wasNeedsReplan) {
      await programBriefRepo.updateStatus(job.briefId, "generating");
      await executeScheduledJob(buildExecutionDeps(deps), job.briefId, job.planId, job.id);

      const finalJob = await jobRegistry.get(job.id);
      const updatedJob = finalJob ?? job;

      await jobRegistry.addLog(job.id, { level: "info", message: "Job restarted from needs-replan", phase: "running" });
      return reply.send(ShowJobResponseSchema.parse({ job: updatedJob }));
    }

    await jobRegistry.addLog(job.id, { level: "info", message: "Job started", phase: "running" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.pause(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot pause job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "info", message: "Job paused", phase: "paused" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.resume(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot resume job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "info", message: "Job resumed", phase: "running" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobRegistry.cancel(id);
    if (!job) {
      return reply.status(400).send({ error: "cannot cancel job (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "warn", message: "Job cancelled", phase: "cancelled" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  app.post("/api/jobs/:id/needs-replan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = NeedsReplanBodySchema.parse(request.body ?? {});
    const reason = body.reason ?? "User requested replan";
    const job = await jobRegistry.markNeedsReplan(id, reason);
    if (!job) {
      return reply.status(400).send({ error: "cannot mark job as needs-replan (invalid state transition or not found)" });
    }
    await jobRegistry.addLog(job.id, { level: "warn", message: `Job needs replan: ${reason}`, phase: "needs-replan" });
    return reply.send(ShowJobResponseSchema.parse({ job }));
  });

  // Show Projects API
  app.get("/api/shows", async (_request, reply) => {
    const projects = await showProjectRepo.list();
    return reply.send(ShowProjectsListResponseSchema.parse({ projects }));
  });

  app.get("/api/shows/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    return reply.send(ShowProjectResponseSchema.parse({ project }));
  });

  app.delete("/api/shows/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    await showProjectRepo.delete(id);
    return reply.send({ success: true });
  });

  app.delete("/api/shows/:id/trace", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await showProjectRepo.get(id);
    if (!project) {
      return reply.status(404).send({ error: "project not found" });
    }
    await showProjectRepo.deleteTrace(id);
    return reply.send({ success: true });
  });

  // Generate Now API
  app.post("/api/shows/generate-now", async (request, reply) => {
    const body = GenerateNowRequestSchema.parse(request.body);
    const brief = await programBriefRepo.get(body.briefId);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }

    let project = await showProjectRepo.getByBriefId(brief.id);
    if (!project) {
      // slug 直接带毫秒时间戳保证唯一。同一天同一个主题如果用户在 chat 里重复说"做X的节目",
      // 会产生多个 brief, 每个 brief 各自独立创建 project, slug 必须互不冲突, 否则 sqlite
      // UNIQUE 报错把整个 generate-now 500 掉, 用户看到 "UNIQUE constraint failed" 完全没法继续。
      const topicSlug = brief.topic ? brief.topic.toLowerCase().replace(/\s+/g, "-") : "show";
      const slug = `${formatRadioDate(nowProvider())}-${topicSlug}-${Date.now().toString(36)}`;
      project = await showProjectRepo.create({ briefId: brief.id, slug });
    }

    const runningStatuses = new Set(["pending", "running", "paused", "needs-replan"]);
    const existingJobs = await jobRegistry.list({ briefId: brief.id });
    const reusableJob = existingJobs.find((job) => runningStatuses.has(job.status));
    if (reusableJob) {
      project = await showProjectRepo.update(project.id, {
        activeJobId: reusableJob.id,
        status: "generating"
      }) ?? project;
      await jobRegistry.addLog(reusableJob.id, {
        level: "info",
        message: "Generate-now request reused existing active job",
        phase: "init"
      });
      const refreshedJob = await jobRegistry.get(reusableJob.id);
      return reply.status(202).send(GenerateNowResponseSchema.parse({
        project,
        job: refreshedJob ?? reusableJob
      }));
    }

    // ─── Plan/job 准备阶段 ─────────────────────────────────────────────────
    // 之前这一段在 try 外面,任意一步报错(LLM 生成 plan 失败/repo 写入失败) 都直接冒泡
    // 给 fastify 默认 500,前端拿不到 error 字段、只看到"Internal Server Error"。
    // 把这一段也包进 try,统一返回 { error: <详细信息> },前端能告诉用户哪里出问题。
    let activePlan: Awaited<ReturnType<typeof generateActivePlan>>;
    let job: Awaited<ReturnType<typeof jobRegistry.create>>;
    let startedJob: Awaited<ReturnType<typeof jobRegistry.start>>;
    let targetJobId: string;
    try {
      activePlan = await generateActivePlan(deps, brief);

      project = await showProjectRepo.update(project.id, {
        activePlanId: activePlan.id,
        status: "generating"
      }) ?? project;

      await showProjectRepo.saveShowPlan(project.id, activePlan);

      job = await jobRegistry.create({ briefId: brief.id, planId: activePlan.id });
      await jobRegistry.addLog(job.id, { level: "info", message: "Job created for generate-now", phase: "init" });
      startedJob = await jobRegistry.start(job.id);
      if (startedJob) {
        await jobRegistry.addLog(startedJob.id, { level: "info", message: "Job started immediately", phase: "running" });
      }

      targetJobId = startedJob?.id ?? job.id;

      project = await showProjectRepo.update(project.id, {
        activeJobId: targetJobId
      }) ?? project;

      await showProjectRepo.appendTrace(project.id, {
        type: "job-started",
        jobId: targetJobId,
        briefId: brief.id,
        planId: activePlan.id,
        status: "generating"
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "unknown error";
      console.error("[generate-now] preparation failed:", err);
      await programBriefRepo.updateStatus(brief.id, "failed").catch(() => {});
      await showProjectRepo.update(project.id, { status: "failed" }).catch(() => {});
      return reply.status(500).send({
        error: `节目准备失败: ${errorMsg}`,
        phase: "preparation"
      });
    }

    try {
      await programBriefRepo.updateStatus(brief.id, "generating");
      await executeScheduledJob(buildExecutionDeps(deps), brief.id, activePlan.id, targetJobId);

      const finalJob = await jobRegistry.get(targetJobId);
      const projectWithTrace = await showProjectRepo.get(project.id);

      if (finalJob && (finalJob.status === "completed" || finalJob.status === "failed")) {
        await showProjectRepo.update(project.id, {
          status: finalJob.status === "completed" ? "ready" : "failed"
        });
        if (finalJob.status === "completed") {
          await programBriefRepo.updateStatus(brief.id, "completed");
        }
      }

      const updatedProject = await showProjectRepo.get(project.id);

      return reply.status(201).send(GenerateNowResponseSchema.parse({
        project: updatedProject ?? projectWithTrace ?? project,
        job: finalJob ?? startedJob ?? job
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "unknown error";
      console.error("[generate-now] execution failed:", err);
      await jobRegistry.addLog(targetJobId, { level: "error", message: `executeScheduledJob failed: ${errorMsg}`, phase: "execution" });
      await jobRegistry.fail(targetJobId, errorMsg);
      await programBriefRepo.updateStatus(brief.id, "failed");

      const failedJob = await jobRegistry.get(targetJobId);
      await showProjectRepo.update(project.id, { status: "failed" });
      const projectWithTrace = await showProjectRepo.get(project.id);

      // 失败时仍返回 project+job 让前端能看到 job 状态/日志, 但额外带 error 字段。
      // GenerateNowResponseSchema 已经包含 project+job, 加 error 不会破坏 parse。
      return reply.status(500).send({
        error: `节目生成失败: ${errorMsg}`,
        phase: "execution",
        project: projectWithTrace ?? project,
        job: failedJob ?? startedJob ?? job
      });
    }
  });

  // Schedule Tonight API
  app.post("/api/shows/schedule-tonight", async (request, reply) => {
    const body = ScheduleTonightRequestSchema.parse(request.body);
    const brief = await programBriefRepo.get(body.briefId);
    if (!brief) {
      return reply.status(404).send({ error: "brief not found" });
    }

    let project = await showProjectRepo.getByBriefId(brief.id);
    if (!project) {
      // 同上 generate-now: slug 带毫秒时间戳, 避免同一天同一主题重复 brief 产生 UNIQUE 冲突。
      const topicSlug = brief.topic ? brief.topic.toLowerCase().replace(/\s+/g, "-") : "show";
      const slug = `${formatRadioDate(nowProvider())}-${topicSlug}-${Date.now().toString(36)}`;
      project = await showProjectRepo.create({ briefId: brief.id, slug });
    }

    const activePlan = await generateActivePlan(deps, brief);

    project = await showProjectRepo.update(project.id, {
      activePlanId: activePlan.id,
      status: "draft"
    }) ?? project;

    await showProjectRepo.saveShowPlan(project.id, activePlan);

    const updatedBrief = await programBriefRepo.update(brief.id, { status: "scheduled" });

    const scheduledAt = nowProvider().toISOString();

    await showProjectRepo.appendTrace(project.id, {
      type: "scheduled",
      briefId: brief.id,
      planId: activePlan.id,
      scheduledAt
    });

    const projectWithTrace = await showProjectRepo.get(project.id);

    return reply.status(201).send(ScheduleTonightResponseSchema.parse({
      project: projectWithTrace ?? project,
      brief: updatedBrief ?? brief,
      scheduledAt
    }));
  });
}
