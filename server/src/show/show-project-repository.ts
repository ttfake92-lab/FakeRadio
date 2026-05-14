import Database from "better-sqlite3";
import type { ShowProject, ShowPlan } from "@fakeradio/shared";
import { ShowProjectSchema } from "@fakeradio/shared";
import { join } from "node:path";
import { mkdirSync, existsSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { redactArbitraryEntry } from "./production-trace.js";

export type ShowProjectRepository = {
  create(input: { briefId: string; slug: string }): Promise<ShowProject>;
  get(id: string): Promise<ShowProject | null>;
  getByBriefId(briefId: string): Promise<ShowProject | null>;
  list(limit?: number): Promise<ShowProject[]>;
  delete(id: string): Promise<void>;
  saveShowPlan(projectId: string, plan: ShowPlan): Promise<void>;
  getShowPlan(projectId: string): Promise<ShowPlan | null>;
  appendTrace(projectId: string, entry: Record<string, unknown>): Promise<void>;
  getTraceLines(projectId: string): Promise<Record<string, unknown>[]>;
  deleteTrace(projectId: string): Promise<void>;
  update(projectId: string, updates: Partial<Omit<ShowProject, "id" | "createdAt" | "updatedAt">>): Promise<ShowProject | null>;
};

function resolveProjectDir(baseDir: string, slug: string): string {
  const normalized = slug.replace(/\\/g, "/").replace(/\.\./g, "");
  if (normalized !== slug) {
    throw new Error("Invalid slug: path traversal not allowed");
  }
  return join(baseDir, normalized);
}

export function createShowProjectRepository(baseDir: string): ShowProjectRepository {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }

  const dbPath = join(baseDir, "show-projects.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS show_projects (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      active_plan_id TEXT,
      active_job_id TEXT,
      directory_path TEXT NOT NULL,
      show_plan_path TEXT,
      production_trace_path TEXT,
      show_notes_path TEXT,
      show_audio_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_projects_brief_id ON show_projects(brief_id);
    CREATE INDEX IF NOT EXISTS idx_projects_created_at ON show_projects(created_at);
  `);

  const stmtInsert = db.prepare(`
    INSERT INTO show_projects (id, brief_id, slug, status, directory_path, created_at, updated_at)
    VALUES (@id, @briefId, @slug, @status, @directoryPath, @createdAt, @updatedAt)
  `);

  const stmtGetById = db.prepare(`SELECT * FROM show_projects WHERE id = ?`);
  const stmtGetByBriefId = db.prepare(`SELECT * FROM show_projects WHERE brief_id = ?`);
  const stmtListAll = db.prepare(`SELECT * FROM show_projects ORDER BY created_at DESC`);
  const stmtDelete = db.prepare(`DELETE FROM show_projects WHERE id = ?`);

  function mapRowToProject(row: Record<string, unknown>): ShowProject {
    return {
      id: row.id as string,
      briefId: row.brief_id as string,
      slug: row.slug as string,
      status: row.status as ShowProject["status"],
      activePlanId: (row.active_plan_id as string) ?? undefined,
      activeJobId: (row.active_job_id as string) ?? undefined,
      directoryPath: row.directory_path as string,
      showPlanPath: (row.show_plan_path as string) ?? undefined,
      productionTracePath: (row.production_trace_path as string) ?? undefined,
      showNotesPath: (row.show_notes_path as string) ?? undefined,
      showAudioPath: (row.show_audio_path as string) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      completedAt: (row.completed_at as string) ?? undefined
    };
  }

  function getProjectDir(id: string): string | null {
    const row = stmtGetById.get(id) as Record<string, unknown> | undefined;
    return row ? (row.directory_path as string) : null;
  }

  function updateProjectPaths(id: string, updates: Record<string, string | null>) {
    const setClauses: string[] = [`updated_at = ?`];
    const values: unknown[] = [new Date().toISOString()];
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(val);
      }
    }
    values.push(id);
    db.prepare(`UPDATE show_projects SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  }

  function updateProject(projectId: string, updates: Partial<Omit<ShowProject, "id" | "createdAt" | "updatedAt">>): ShowProject | null {
    const row = stmtGetById.get(projectId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const project = mapRowToProject(row);
    
    // Build update statement
    const setClauses: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];
    
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.activePlanId !== undefined) {
      setClauses.push("active_plan_id = ?");
      values.push(updates.activePlanId);
    }
    if (updates.activeJobId !== undefined) {
      setClauses.push("active_job_id = ?");
      values.push(updates.activeJobId);
    }
    if (updates.showPlanPath !== undefined) {
      setClauses.push("show_plan_path = ?");
      values.push(updates.showPlanPath);
    }
    if (updates.productionTracePath !== undefined) {
      setClauses.push("production_trace_path = ?");
      values.push(updates.productionTracePath);
    }
    if (updates.showNotesPath !== undefined) {
      setClauses.push("show_notes_path = ?");
      values.push(updates.showNotesPath);
    }
    if (updates.showAudioPath !== undefined) {
      setClauses.push("show_audio_path = ?");
      values.push(updates.showAudioPath);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push("completed_at = ?");
      values.push(updates.completedAt);
    }
    
    values.push(projectId);
    db.prepare(`UPDATE show_projects SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
    
    // Get and return updated project
    const updatedRow = stmtGetById.get(projectId) as Record<string, unknown> | undefined;
    return updatedRow ? mapRowToProject(updatedRow) : null;
  }
  
  return {
    async create(input: { briefId: string; slug: string }): Promise<ShowProject> {
      const normalized = input.slug.replace(/\\/g, "/").replace(/\.\./g, "");
      if (normalized !== input.slug) {
        throw new Error("Invalid slug: path traversal not allowed");
      }

      const directoryPath = join(baseDir, normalized);
      mkdirSync(directoryPath, { recursive: true });

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      stmtInsert.run({
        id,
        briefId: input.briefId,
        slug: normalized,
        status: "draft",
        directoryPath,
        createdAt: now,
        updatedAt: now
      });

      return {
        id,
        briefId: input.briefId,
        slug: normalized,
        status: "draft",
        directoryPath,
        createdAt: now,
        updatedAt: now
      };
    },

    async get(id: string): Promise<ShowProject | null> {
      const row = stmtGetById.get(id) as Record<string, unknown> | undefined;
      return row ? mapRowToProject(row) : null;
    },

    async getByBriefId(briefId: string): Promise<ShowProject | null> {
      const row = stmtGetByBriefId.get(briefId) as Record<string, unknown> | undefined;
      return row ? mapRowToProject(row) : null;
    },

    async list(limit?: number): Promise<ShowProject[]> {
      const rows = limit
        ? (db.prepare(`SELECT * FROM show_projects ORDER BY created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[])
        : (stmtListAll.all() as Record<string, unknown>[]);
      return rows.map(mapRowToProject);
    },

    async delete(id: string): Promise<void> {
      const project = await this.get(id);
      if (project) {
        if (existsSync(project.directoryPath)) {
          rmSync(project.directoryPath, { recursive: true, force: true });
        }
        stmtDelete.run(id);
      }
    },

    async saveShowPlan(projectId: string, plan: ShowPlan): Promise<void> {
      const project = await this.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      const planPath = join(project.directoryPath, "show-plan.json");
      writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8");
      updateProjectPaths(projectId, { show_plan_path: planPath });
    },

    async getShowPlan(projectId: string): Promise<ShowPlan | null> {
      const project = await this.get(projectId);
      if (!project?.showPlanPath) return null;
      if (!existsSync(project.showPlanPath)) return null;
      const content = readFileSync(project.showPlanPath, "utf-8");
      return JSON.parse(content) as ShowPlan;
    },

    async appendTrace(projectId: string, entry: Record<string, unknown>): Promise<void> {
      const project = await this.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      const redactedEntry = redactArbitraryEntry(entry);
      const tracePath = join(project.directoryPath, "production-trace.jsonl");
      appendFileSync(tracePath, JSON.stringify(redactedEntry) + "\n", "utf-8");
      updateProjectPaths(projectId, { production_trace_path: tracePath });
    },

    async getTraceLines(projectId: string): Promise<Record<string, unknown>[]> {
      const project = await this.get(projectId);
      if (!project?.productionTracePath) return [];
      if (!existsSync(project.productionTracePath)) return [];

      const content = readFileSync(project.productionTracePath, "utf-8");
      const lines = content.split("\n").filter(line => line.trim() !== "");
      return lines.map(line => JSON.parse(line) as Record<string, unknown>);
    },

    async deleteTrace(projectId: string): Promise<void> {
      const project = await this.get(projectId);
      if (!project) return;
      if (project.productionTracePath && existsSync(project.productionTracePath)) {
        rmSync(project.productionTracePath, { force: true });
      }
      updateProjectPaths(projectId, { production_trace_path: null });
    },

    async update(projectId: string, updates: Partial<Omit<ShowProject, "id" | "createdAt" | "updatedAt">>): Promise<ShowProject | null> {
      return updateProject(projectId, updates);
    }
  };
}
