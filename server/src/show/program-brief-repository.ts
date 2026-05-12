import Database from "better-sqlite3";
import type { ProgramBrief, ProgramBriefStatus, ProgramBriefType } from "@fakeradio/shared";
import { ProgramBriefSchema } from "@fakeradio/shared";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export type ProgramBriefRepository = {
  save(brief: ProgramBrief): Promise<ProgramBrief>;
  get(id: string): Promise<ProgramBrief | null>;
  list(filter?: { status?: ProgramBriefStatus; type?: ProgramBriefType; targetDate?: string }): Promise<ProgramBrief[]>;
  updateStatus(id: string, status: ProgramBriefStatus): Promise<void>;
  delete(id: string): Promise<void>;
};

export function createProgramBriefRepository(baseDir: string): ProgramBriefRepository {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  const dbPath = join(baseDir, "briefs.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS program_briefs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      topic TEXT,
      scope TEXT,
      target_date TEXT NOT NULL,
      target_block_at TEXT,
      priority TEXT NOT NULL,
      constraints_json TEXT,
      status TEXT NOT NULL,
      created_from_message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_briefs_status ON program_briefs(status);
    CREATE INDEX IF NOT EXISTS idx_briefs_type ON program_briefs(type);
    CREATE INDEX IF NOT EXISTS idx_briefs_target_date ON program_briefs(target_date);
  `);

  const stmtInsert = db.prepare(`
    INSERT INTO program_briefs (id, type, topic, scope, target_date, target_block_at, priority, constraints_json, status, created_from_message_id, created_at, updated_at)
    VALUES (@id, @type, @topic, @scope, @targetDate, @targetBlockAt, @priority, @constraintsJson, @status, @createdFromMessageId, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      type = @type,
      topic = @topic,
      scope = @scope,
      target_date = @targetDate,
      target_block_at = @targetBlockAt,
      priority = @priority,
      constraints_json = @constraintsJson,
      status = @status,
      created_from_message_id = @createdFromMessageId,
      updated_at = @updatedAt
  `);

  const stmtGet = db.prepare(`SELECT * FROM program_briefs WHERE id = ?`);
  const stmtListAll = db.prepare(`SELECT * FROM program_briefs ORDER BY created_at DESC`);
  const stmtListByStatus = db.prepare(`SELECT * FROM program_briefs WHERE status = ? ORDER BY created_at DESC`);
  const stmtListByType = db.prepare(`SELECT * FROM program_briefs WHERE type = ? ORDER BY created_at DESC`);
  const stmtListByTargetDate = db.prepare(`SELECT * FROM program_briefs WHERE target_date = ? ORDER BY created_at DESC`);
  const stmtListByStatusAndType = db.prepare(`SELECT * FROM program_briefs WHERE status = ? AND type = ? ORDER BY created_at DESC`);
  const stmtListByStatusAndTargetDate = db.prepare(`SELECT * FROM program_briefs WHERE status = ? AND target_date = ? ORDER BY created_at DESC`);
  const stmtListByTypeAndTargetDate = db.prepare(`SELECT * FROM program_briefs WHERE type = ? AND target_date = ? ORDER BY created_at DESC`);
  const stmtListByAll = db.prepare(`SELECT * FROM program_briefs WHERE status = ? AND type = ? AND target_date = ? ORDER BY created_at DESC`);
  const stmtUpdateStatus = db.prepare(`UPDATE program_briefs SET status = ?, updated_at = ? WHERE id = ?`);
  const stmtDelete = db.prepare(`DELETE FROM program_briefs WHERE id = ?`);
  const stmtExists = db.prepare(`SELECT id FROM program_briefs WHERE id = ?`);

  function mapRowToBrief(row: Record<string, unknown>): ProgramBrief {
    const constraintsJson = row.constraints_json as string | null;
    const constraints = constraintsJson ? JSON.parse(constraintsJson) : undefined;
    return {
      id: row.id as string,
      type: row.type as ProgramBriefType,
      topic: (row.topic as string | null) ?? undefined,
      scope: (row.scope as ProgramBrief["scope"]) ?? undefined,
      targetDate: row.target_date as string,
      targetBlockAt: (row.target_block_at as string | null) ?? undefined,
      priority: row.priority as ProgramBrief["priority"],
      constraints,
      status: row.status as ProgramBriefStatus,
      createdFromMessageId: (row.created_from_message_id as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }

  return {
    save(brief: ProgramBrief): Promise<ProgramBrief> {
      ProgramBriefSchema.parse(brief);
      const constraintsJson = brief.constraints ? JSON.stringify(brief.constraints) : null;
      stmtInsert.run({
        id: brief.id,
        type: brief.type,
        topic: brief.topic ?? null,
        scope: brief.scope ?? null,
        targetDate: brief.targetDate,
        targetBlockAt: brief.targetBlockAt ?? null,
        priority: brief.priority,
        constraintsJson,
        status: brief.status,
        createdFromMessageId: brief.createdFromMessageId ?? null,
        createdAt: brief.createdAt,
        updatedAt: brief.updatedAt
      });
      return Promise.resolve(brief);
    },

    get(id: string): Promise<ProgramBrief | null> {
      const row = stmtGet.get(id) as Record<string, unknown> | undefined;
      if (!row) return Promise.resolve(null);
      return Promise.resolve(mapRowToBrief(row));
    },

    list(filter?: { status?: ProgramBriefStatus; type?: ProgramBriefType; targetDate?: string }): Promise<ProgramBrief[]> {
      let rows: unknown[];
      if (filter?.status && filter?.type && filter?.targetDate) {
        rows = stmtListByAll.all(filter.status, filter.type, filter.targetDate);
      } else if (filter?.status && filter?.type) {
        rows = stmtListByStatusAndType.all(filter.status, filter.type);
      } else if (filter?.status && filter?.targetDate) {
        rows = stmtListByStatusAndTargetDate.all(filter.status, filter.targetDate);
      } else if (filter?.type && filter?.targetDate) {
        rows = stmtListByTypeAndTargetDate.all(filter.type, filter.targetDate);
      } else if (filter?.status) {
        rows = stmtListByStatus.all(filter.status);
      } else if (filter?.type) {
        rows = stmtListByType.all(filter.type);
      } else if (filter?.targetDate) {
        rows = stmtListByTargetDate.all(filter.targetDate);
      } else {
        rows = stmtListAll.all();
      }
      return Promise.resolve((rows as Record<string, unknown>[]).map(mapRowToBrief));
    },

    updateStatus(id: string, status: ProgramBriefStatus): Promise<void> {
      const exists = stmtExists.get(id);
      if (!exists) {
        return Promise.reject(new Error(`Brief not found: ${id}`));
      }
      const updatedAt = new Date().toISOString();
      stmtUpdateStatus.run(status, updatedAt, id);
      return Promise.resolve();
    },

    delete(id: string): Promise<void> {
      stmtDelete.run(id);
      return Promise.resolve();
    }
  };
}
