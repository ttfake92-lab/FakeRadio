import { describe, it, expect } from "vitest";
import type { ProgramBrief, ShowJob, ShowProject } from "@fakeradio/shared";

function createBrief(id: string, topic: string): ProgramBrief {
  return {
    id,
    type: "theme-show",
    topic,
    scope: "full-show",
    targetDate: new Date().toISOString(),
    priority: "user-requested",
    status: "draft",
    constraints: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createJob(id: string, briefId: string, status: ShowJob["status"]): ShowJob {
  return {
    id,
    briefId,
    planId: `plan-${id}`,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    trace: [],
  };
}

function createProject(id: string, briefId: string, activeJobId?: string): ShowProject {
  return {
    id,
    briefId,
    slug: `show-${id}`,
    status: "draft",
    activeJobId,
    directoryPath: `/user/shows/${id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getJobsForBrief(jobs: ShowJob[] | undefined, briefId: string | null | undefined): ShowJob[] {
  if (!briefId || !jobs) return [];
  return jobs.filter((j) => j.briefId === briefId);
}

function getProjectsForBrief(projects: ShowProject[] | undefined, briefId: string | null | undefined): ShowProject[] {
  if (!briefId || !projects) return [];
  return projects.filter((p) => p.briefId === briefId);
}

function computeActiveProjectForBrief(
  jobs: ShowJob[] | undefined,
  projects: ShowProject[] | undefined,
  briefId: string | null | undefined,
  selectedProjectId: string | null
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

describe("multi-brief user flow: ProductionBoard filtering", () => {
  const briefA = createBrief("brief-a", "Bee Gees");
  const briefB = createBrief("brief-b", "ABBA");

  const jobA = createJob("job-a1", "brief-a", "running");
  const jobB = createJob("job-b1", "brief-b", "pending");
  const jobACompleted = createJob("job-a2", "brief-a", "completed");

  const projectA = createProject("show-a", "brief-a", "job-a1");
  const projectACompleted = createProject("show-a-done", "brief-a", "job-a2");
  const projectB = createProject("show-b", "brief-b", "job-b1");

  const allJobs = [jobA, jobB, jobACompleted];
  const allProjects = [projectA, projectACompleted, projectB];

  it("ProductionBoard should only show jobs for active brief", () => {
    const jobsForA = getJobsForBrief(allJobs, briefA.id);
    const jobsForB = getJobsForBrief(allJobs, briefB.id);

    expect(jobsForA.map(j => j.id)).toEqual(["job-a1", "job-a2"]);
    expect(jobsForB.map(j => j.id)).toEqual(["job-b1"]);
  });

  it("ProductionBoard should only show projects for active brief", () => {
    const projectsForA = getProjectsForBrief(allProjects, briefA.id);
    const projectsForB = getProjectsForBrief(allProjects, briefB.id);

    expect(projectsForA.map(p => p.id)).toEqual(["show-a", "show-a-done"]);
    expect(projectsForB.map(p => p.id)).toEqual(["show-b"]);
  });

  it("when active brief is B, completedJob must be from brief B", () => {
    const jobsForB = getJobsForBrief(allJobs, briefB.id);
    const completedJob = jobsForB.find((j) => j.status === "completed");

    expect(completedJob).toBeUndefined();
  });

  it("when active brief is A, completedJob must be from brief A even though brief B has pending job", () => {
    const jobsForA = getJobsForBrief(allJobs, briefA.id);
    const completedJob = jobsForA.find((j) => j.status === "completed");

    expect(completedJob?.id).toBe("job-a2");
    expect(completedJob?.briefId).toBe("brief-a");
  });

  it("activeProject selection: brief A has completed job -> shows project, brief B has no completed job -> no auto-selected project", () => {
    const activeProjectA = computeActiveProjectForBrief(allJobs, allProjects, briefA.id, null);
    const activeProjectB = computeActiveProjectForBrief(allJobs, allProjects, briefB.id, null);

    expect(activeProjectA?.id).toBe("show-a-done");
    expect(activeProjectA?.briefId).toBe("brief-a");

    expect(activeProjectB).toBeNull();
  });

  it("selectedProjectId from another brief should be ignored when switching briefs", () => {
    const selectedFromBriefA = "show-a-done";

    const activeProjectWhenBriefB = computeActiveProjectForBrief(
      allJobs, allProjects, briefB.id, selectedFromBriefA
    );

    expect(activeProjectWhenBriefB).toBeNull();
  });

  it("switching from brief A (with completed job) to brief B (no completed job) correctly shows no auto-selected project", () => {
    const activeProjectBriefA = computeActiveProjectForBrief(
      allJobs, allProjects, briefA.id, null
    );
    expect(activeProjectBriefA?.id).toBe("show-a-done");

    const activeProjectBriefB = computeActiveProjectForBrief(
      allJobs, allProjects, briefB.id, null
    );
    expect(activeProjectBriefB).toBeNull();
  });
});
