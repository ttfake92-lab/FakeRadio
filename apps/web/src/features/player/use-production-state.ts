"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { ProgramBrief, ShowPlan, ShowJob, ShowProject, ProductionLog } from "@fakeradio/shared";
import { getBriefs, getShowPlans, getShowJobs, getShowProjects, getJob, pauseJob, resumeJob, cancelJob, markJobNeedsReplan, addConstraintsToPlan, type ShowPlanBlockConstraints } from "../../lib/api-client";

const ACTIVE_JOB_STATUSES: string[] = ["pending", "running", "paused", "needs-replan"];

/**
 * 管理 production 状态（briefs、plans、jobs、projects、logs）和相关 API 操作。
 */
export function useProductionState() {
  const [productionBriefs, setProductionBriefs] = useState<ProgramBrief[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [productionPlans, setProductionPlans] = useState<ShowPlan[]>([]);
  const [productionJobs, setProductionJobs] = useState<ShowJob[]>([]);
  const [productionProjects, setProductionProjects] = useState<ShowProject[]>([]);
  const [generationLogs, setGenerationLogs] = useState<ProductionLog[]>([]);

  const activeBrief = useMemo(() => {
    if (activeBriefId) {
      return productionBriefs.find((b) => b.id === activeBriefId) ?? null;
    }
    return productionBriefs[0] ?? null;
  }, [activeBriefId, productionBriefs]);

  const activePlan = useMemo(() => {
    if (!activeBrief) return null;
    return (
      productionPlans.find((p) => p.active && p.briefId === activeBrief.id) ??
      productionPlans.find((p) => p.briefId === activeBrief.id) ??
      null
    );
  }, [activeBrief, productionPlans]);

  const activeJob = useMemo(() => {
    if (!activeBrief) return null;
    const jobsForBrief = productionJobs.filter((j) => j.briefId === activeBrief.id);
    return (
      jobsForBrief.find((j) => ACTIVE_JOB_STATUSES.includes(j.status)) ??
      jobsForBrief[0] ??
      null
    );
  }, [activeBrief, productionJobs]);

  /** 加载初始 production 数据（供 loadDashboard 调用） */
  const loadProductionData = useCallback(async (briefIdOverride?: string | null) => {
    const [briefsResponse, projectsResponse] = await Promise.all([
      getBriefs().catch(() => ({ briefs: [] })),
      getShowProjects().catch(() => ({ projects: [] })),
    ]);

    const briefs = briefsResponse.briefs ?? [];
    setProductionBriefs(briefs);
    setProductionProjects(projectsResponse.projects ?? []);

    // 确定 active brief
    let currentActiveBriefId = briefIdOverride ?? null;
    if (briefs.length > 0) {
      if (!currentActiveBriefId || !briefs.find((b) => b.id === currentActiveBriefId)) {
        const firstBrief = briefs[0];
        if (firstBrief) {
          currentActiveBriefId = firstBrief.id;
          setActiveBriefId(currentActiveBriefId);
        }
      }
    }

    // 按 active brief 获取 plans 和 jobs
    const [plansResponse, jobsResponse] = await Promise.all([
      currentActiveBriefId
        ? getShowPlans(currentActiveBriefId).catch(() => ({ plans: [] }))
        : getShowPlans().catch(() => ({ plans: [] })),
      currentActiveBriefId
        ? getShowJobs(currentActiveBriefId).catch(() => ({ jobs: [] }))
        : getShowJobs().catch(() => ({ jobs: [] })),
    ]);
    setProductionPlans(plansResponse.plans ?? []);
    setProductionJobs(jobsResponse.jobs ?? []);
  }, []);

  const handleSwitchBrief = useCallback(async (briefId: string) => {
    setActiveBriefId(briefId);
    const [plansResponse, jobsResponse] = await Promise.all([
      getShowPlans(briefId).catch(() => ({ plans: [] })),
      getShowJobs(briefId).catch(() => ({ jobs: [] })),
    ]);
    setProductionPlans(plansResponse.plans ?? []);
    setProductionJobs(jobsResponse.jobs ?? []);
  }, []);

  const handlePauseJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await pauseJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job)),
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleResumeJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await resumeJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job)),
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleCancelJob = useCallback(async () => {
    if (!activeJob) return;
    try {
      const response = await cancelJob(activeJob.id);
      if (response.job) {
        setProductionJobs((prev) =>
          prev.map((job) => (job.id === response.job!.id ? response.job! : job)),
        );
      }
    } catch {
      // Ignore errors for now
    }
  }, [activeJob]);

  const handleAddConstraint = useCallback(
    async (constraints: ShowPlanBlockConstraints) => {
      if (!activePlan) return;
      try {
        const response = await addConstraintsToPlan(activePlan.id, constraints);
        if (response.plan) {
          setProductionPlans((prev) => [...prev, response.plan]);
          if (activeJob) {
            await markJobNeedsReplan(activeJob.id, "用户追加新约束，触发重新规划");
          }
        }
      } catch {
        // Ignore errors for now
      }
    },
    [activePlan, activeJob],
  );

  const handleProjectsChanged = useCallback(async () => {
    try {
      const response = await getShowProjects();
      setProductionProjects(response.projects ?? []);
    } catch (error) {
      console.error("Failed to load show projects:", error);
    }
  }, []);

  // Active job log polling
  useEffect(() => {
    if (!activeJob) return;
    const pollJob = async () => {
      try {
        const result = await getJob(activeJob.id);
        if (result.job) {
          setProductionJobs((prev) =>
            prev.map((j) => (j.id === result.job!.id ? result.job! : j)),
          );
          setGenerationLogs(result.job.logs);
        }
      } catch {
        // silently fail
      }
    };
    pollJob();
    const id = setInterval(pollJob, 3000);
    return () => clearInterval(id);
  }, [activeJob?.id]);

  return {
    productionBriefs,
    activeBriefId,
    productionPlans,
    productionJobs,
    productionProjects,
    generationLogs,
    activeBrief,
    activePlan,
    activeJob,
    loadProductionData,
    handleSwitchBrief,
    handlePauseJob,
    handleResumeJob,
    handleCancelJob,
    handleAddConstraint,
    handleProjectsChanged,
  };
}
