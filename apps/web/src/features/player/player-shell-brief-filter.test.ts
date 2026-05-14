import { describe, it, expect } from "vitest";
import type { ProgramBrief, ShowPlan, ShowJob } from "@fakeradio/shared";

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

function createPlan(id: string, briefId: string, active: boolean): ShowPlan {
  return {
    id,
    briefId,
    version: 1,
    active,
    briefSnapshot: createBrief(briefId, `Topic ${briefId}`),
    blocks: [{ role: "opening", title: "Test Block", storyGoal: "Test", selectionGoal: "Test", sourceNeeds: [], constraints: {}, episodeTargets: [] }],
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

function findActiveBrief(briefs: ProgramBrief[], activeBriefId: string | null): ProgramBrief | null {
  if (!activeBriefId) return briefs[0] ?? null;
  return briefs.find((b) => b.id === activeBriefId) ?? null;
}

function findFilteredActivePlan(plans: ShowPlan[], activeBrief: ProgramBrief | null): ShowPlan | null {
  if (!activeBrief) return null;
  return (
    plans.find((p) => p.active && p.briefId === activeBrief.id) ??
    plans.find((p) => p.briefId === activeBrief.id) ??
    null
  );
}

function findUnfilteredActivePlan(plans: ShowPlan[]): ShowPlan | null {
  return plans.find((p) => p.active) ?? null;
}

function findFilteredActiveJob(jobs: ShowJob[], activeBrief: ProgramBrief | null): ShowJob | null {
  if (!activeBrief) return null;
  const jobsForBrief = jobs.filter((j) => j.briefId === activeBrief.id);
  return (
    jobsForBrief.find((j) =>
      ["pending", "running", "paused", "needs-replan"].includes(j.status)
    ) ?? jobsForBrief[0] ?? null
  );
}

function findUnfilteredActiveJob(jobs: ShowJob[]): ShowJob | null {
  return (
    jobs.find((j) =>
      ["pending", "running", "paused", "needs-replan"].includes(j.status)
    ) ?? jobs[0] ?? null
  );
}

describe("activeBriefId filtering", () => {
  it("filtered activePlan uses activeBriefId to find correct plan", () => {
    const briefs = [createBrief("brief-a", "Bee Gees"), createBrief("brief-b", "ABBA")];
    const plans = [
      createPlan("plan-a1", "brief-a", true),
      createPlan("plan-b1", "brief-b", true),
    ];

    const activeBrief = findActiveBrief(briefs, "brief-b");
    const activePlan = findFilteredActivePlan(plans, activeBrief);

    expect(activePlan?.id).toBe("plan-b1");
    expect(activePlan?.briefId).toBe("brief-b");
  });

  it("unfiltered activePlan finds wrong plan when activeBriefId is different", () => {
    const briefs = [createBrief("brief-a", "Bee Gees"), createBrief("brief-b", "ABBA")];
    const plans = [
      createPlan("plan-a1", "brief-a", true),
      createPlan("plan-b1", "brief-b", true),
    ];

    const activeBrief = findActiveBrief(briefs, "brief-b");
    const filteredPlan = findFilteredActivePlan(plans, activeBrief);
    const unfilteredPlan = findUnfilteredActivePlan(plans);

    expect(filteredPlan?.briefId).toBe("brief-b");
    expect(unfilteredPlan?.briefId).toBe("brief-a");
    expect(filteredPlan?.id).not.toBe(unfilteredPlan?.id);
  });

  it("filtered activeJob uses activeBriefId to find correct job", () => {
    const briefs = [createBrief("brief-a", "Bee Gees"), createBrief("brief-b", "ABBA")];
    const jobs = [
      createJob("job-a1", "brief-a", "running"),
      createJob("job-b1", "brief-b", "pending"),
      createJob("job-b2", "brief-b", "completed"),
    ];

    const activeBrief = findActiveBrief(briefs, "brief-b");
    const activeJob = findFilteredActiveJob(jobs, activeBrief);

    expect(activeJob?.id).toBe("job-b1");
    expect(activeJob?.briefId).toBe("brief-b");
  });

  it("unfiltered activeJob finds wrong job when multiple briefs exist", () => {
    const briefs = [createBrief("brief-a", "Bee Gees"), createBrief("brief-b", "ABBA")];
    const jobs = [
      createJob("job-a1", "brief-a", "running"),
      createJob("job-b1", "brief-b", "pending"),
    ];

    const activeBrief = findActiveBrief(briefs, "brief-b");
    const filteredJob = findFilteredActiveJob(jobs, activeBrief);
    const unfilteredJob = findUnfilteredActiveJob(jobs);

    expect(filteredJob?.briefId).toBe("brief-b");
    expect(unfilteredJob?.briefId).toBe("brief-a");
    expect(filteredJob?.id).not.toBe(unfilteredJob?.id);
  });

  it("filtered functions return null when no active brief", () => {
    const briefs: ProgramBrief[] = [];
    const plans = [createPlan("plan-a1", "brief-a", true)];
    const jobs = [createJob("job-a1", "brief-a", "running")];

    const activeBrief = findActiveBrief(briefs, null);
    const activePlan = findFilteredActivePlan(plans, activeBrief);
    const activeJob = findFilteredActiveJob(jobs, activeBrief);

    expect(activePlan).toBeNull();
    expect(activeJob).toBeNull();
  });
});
