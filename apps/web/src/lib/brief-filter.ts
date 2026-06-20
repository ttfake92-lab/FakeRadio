import type { ShowJob, ShowProject } from "@fakeradio/shared";

/** 按 briefId 过滤 jobs */
export function getJobsForBrief(
  jobs: ShowJob[] | undefined,
  briefId: string | null | undefined,
): ShowJob[] {
  if (!briefId || !jobs) return [];
  return jobs.filter((j) => j.briefId === briefId);
}

/** 按 briefId 过滤 projects */
export function getProjectsForBrief(
  projects: ShowProject[] | undefined,
  briefId: string | null | undefined,
): ShowProject[] {
  if (!briefId || !projects) return [];
  return projects.filter((p) => p.briefId === briefId);
}

/**
 * 计算给定 brief 下的活跃 project。
 * 优先使用 selectedProjectId；否则找 completed job 对应的 project。
 */
export function computeActiveProject(
  jobs: ShowJob[] | undefined,
  projects: ShowProject[] | undefined,
  briefId: string | null | undefined,
  selectedProjectId: string | null,
): ShowProject | null {
  const jobsForBrief = getJobsForBrief(jobs, briefId);
  const projectsForBrief = getProjectsForBrief(projects, briefId);

  const completedJob = jobsForBrief.find((j) => j.status === "completed");

  if (selectedProjectId) {
    return projectsForBrief.find((p) => p.id === selectedProjectId) ?? null;
  }
  if (completedJob) {
    return (
      projectsForBrief.find((p) => p.activeJobId === completedJob.id) ??
      projectsForBrief.find((p) => p.briefId === completedJob.briefId) ??
      null
    );
  }
  return null;
}
