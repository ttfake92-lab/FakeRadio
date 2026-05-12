import Database from "better-sqlite3";
import type {
  ShowJob,
  ShowJobStatus,
  ProductionLog,
  TechTraceEntry
} from "@fakeradio/shared";
import { ShowJobSchema } from "@fakeradio/shared";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export type JobRegistry = {
  create(params: { briefId: string; planId: string }): Promise<ShowJob>;
  get(id: string): Promise<ShowJob | null>;
  list(filter?: { briefId?: string }): Promise<ShowJob[]>;
  start(id: string): Promise<ShowJob | null>;
  pause(id: string): Promise<ShowJob | null>;
  resume(id: string): Promise<ShowJob | null>;
  complete(id: string): Promise<ShowJob | null>;
  fail(id: string, error: string): Promise<ShowJob | null>;
  cancel(id: string): Promise<ShowJob | null>;
  markNeedsReplan(id: string, reason: string): Promise<ShowJob | null>;
  addLog(id: string, log: Omit<ProductionLog, "timestamp">): Promise<ShowJob | null>;
  addTrace(id: string, entry: Omit<TechTraceEntry, "timestamp">): Promise<ShowJob | null>;
};

type JobRow = {
  id: string;
  brief_id: string;
  plan_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  reason: string | null;
  logs_json: string;
  trace_json: string;
};

function isValidTransition(from: ShowJobStatus, to: ShowJobStatus): boolean {
  const transitions: Record<ShowJobStatus, ShowJobStatus[]> = {
    pending: ["running", "cancelled"],
    running: ["paused", "needs-replan", "cancelled", "failed", "completed"],
    paused: ["running", "cancelled"],
    "needs-replan": ["running", "cancelled"],
    cancelled: [],
    failed: [],
    completed: []
  };
  return transitions[from]?.includes(to) ?? false;
}

export function createJobRegistry(baseDir: string): JobRegistry {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  const dbPath = join(baseDir, "show-jobs.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS show_jobs (
      id TEXT NOT NULL PRIMARY KEY,
      brief_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      reason TEXT,
      logs_json TEXT NOT NULL DEFAULT '[]',
      trace_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_brief_id ON show_jobs(brief_id);
  `);

  const stmtInsert = db.prepare(`
    INSERT INTO show_jobs (id, brief_id, plan_id, status, created_at, updated_at, logs_json, trace_json)
    VALUES (@id, @briefId, @planId, @status, @createdAt, @updatedAt, @logsJson, @traceJson)
  `);

  const stmtGet = db.prepare(`SELECT * FROM show_jobs WHERE id = ?`);
  const stmtListAll = db.prepare(`SELECT * FROM show_jobs ORDER BY updated_at DESC`);
  const stmtListByBriefId = db.prepare(`SELECT * FROM show_jobs WHERE brief_id = ? ORDER BY updated_at DESC`);
  const stmtUpdate = db.prepare(`
    UPDATE show_jobs SET
      status = @status,
      updated_at = @updatedAt,
      started_at = @startedAt,
      completed_at = @completedAt,
      error = @error,
      reason = @reason,
      logs_json = @logsJson,
      trace_json = @traceJson
    WHERE id = @id
  `);

  function mapRowToJob(row: JobRow): ShowJob {
    const logs = JSON.parse(row.logs_json) as ProductionLog[];
    const trace = JSON.parse(row.trace_json) as TechTraceEntry[];
    return {
      id: row.id,
      briefId: row.brief_id,
      planId: row.plan_id,
      status: row.status as ShowJobStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      error: row.error ?? undefined,
      reason: row.reason ?? undefined,
      logs,
      trace
    };
  }

  function jobRowToUpdateParams(job: ShowJob): Record<string, unknown> {
    return {
      id: job.id,
      status: job.status,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      error: job.error ?? null,
      reason: job.reason ?? null,
      logsJson: JSON.stringify(job.logs),
      traceJson: JSON.stringify(job.trace)
    };
  }

  function updateJob(id: string, updater: (job: ShowJob) => ShowJob): ShowJob | null {
    const row = stmtGet.get(id) as JobRow | undefined;
    if (!row) return null;
    const job = mapRowToJob(row);
    const updated = updater(job);
    if (updated.status === job.status) return null;
    stmtUpdate.run(jobRowToUpdateParams(updated));
    return updated;
  }

  return {
    async create(params: { briefId: string; planId: string }): Promise<ShowJob> {
      const now = new Date().toISOString();
      const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: ShowJob = {
        id,
        briefId: params.briefId,
        planId: params.planId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        logs: [],
        trace: []
      };
      ShowJobSchema.parse(job);
      stmtInsert.run({
        id: job.id,
        briefId: job.briefId,
        planId: job.planId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        logsJson: "[]",
        traceJson: "[]"
      });
      return job;
    },

    async get(id: string): Promise<ShowJob | null> {
      const row = stmtGet.get(id) as JobRow | undefined;
      if (!row) return null;
      return mapRowToJob(row);
    },

    async list(filter?: { briefId?: string }): Promise<ShowJob[]> {
      let rows: JobRow[];
      if (filter?.briefId) {
        rows = stmtListByBriefId.all(filter.briefId) as JobRow[];
      } else {
        rows = stmtListAll.all() as JobRow[];
      }
      return rows.map(mapRowToJob);
    },

    async start(id: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "running")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "running", updatedAt: now, startedAt: now };
      });
    },

    async pause(id: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "paused")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "paused", updatedAt: now };
      });
    },

    async resume(id: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "running")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "running", updatedAt: now };
      });
    },

    async complete(id: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "completed")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "completed", updatedAt: now, completedAt: now };
      });
    },

    async fail(id: string, error: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "failed")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "failed", updatedAt: now, error };
      });
    },

    async cancel(id: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "cancelled")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "cancelled", updatedAt: now };
      });
    },

    async markNeedsReplan(id: string, reason: string): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        if (!isValidTransition(job.status, "needs-replan")) return job;
        const now = new Date().toISOString();
        return { ...job, status: "needs-replan", updatedAt: now, reason };
      });
    },

    async addLog(id: string, log: Omit<ProductionLog, "timestamp">): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        const now = new Date().toISOString();
        const fullLog: ProductionLog = { ...log, timestamp: now };
        return { ...job, logs: [...job.logs, fullLog], updatedAt: now };
      });
    },

    async addTrace(id: string, entry: Omit<TechTraceEntry, "timestamp">): Promise<ShowJob | null> {
      return updateJob(id, (job) => {
        const now = new Date().toISOString();
        const fullEntry: TechTraceEntry = { ...entry, timestamp: now };
        return { ...job, trace: [...job.trace, fullEntry], updatedAt: now };
      });
    }
  };
}

export type { ProductionLog, TechTraceEntry } from "@fakeradio/shared";
