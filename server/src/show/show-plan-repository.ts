import Database from "better-sqlite3";
import type { ShowPlan } from "@fakeradio/shared";
import { ShowPlanSchema } from "@fakeradio/shared";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export type ShowPlanRepository = {
  save(plan: ShowPlan): Promise<ShowPlan>;
  get(id: string, version?: number): Promise<ShowPlan | null>;
  list(filter?: { briefId?: string; activeOnly?: boolean }): Promise<ShowPlan[]>;
  delete(id: string): Promise<void>;
};

export function createShowPlanRepository(baseDir: string): ShowPlanRepository {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  const dbPath = join(baseDir, "show-plans.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS show_plans (
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      brief_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_plans_brief_id ON show_plans(brief_id);
    CREATE INDEX IF NOT EXISTS idx_plans_active ON show_plans(id, active);
  `);

  const stmtInsert = db.prepare(`
    INSERT INTO show_plans (id, version, brief_id, active, plan_json, created_at, updated_at)
    VALUES (@id, @version, @briefId, @active, @planJson, @createdAt, @updatedAt)
    ON CONFLICT(id, version) DO UPDATE SET
      active = @active,
      plan_json = @planJson,
      updated_at = @updatedAt
  `);

  const stmtDeactivateAll = db.prepare(`UPDATE show_plans SET active = 0 WHERE id = ?`);

  const stmtGetByVersion = db.prepare(`SELECT * FROM show_plans WHERE id = ? AND version = ?`);
  const stmtGetLatest = db.prepare(`SELECT * FROM show_plans WHERE id = ? AND active = 1`);

  const stmtListAll = db.prepare(`SELECT * FROM show_plans ORDER BY updated_at DESC`);
  const stmtListByBriefId = db.prepare(`SELECT * FROM show_plans WHERE brief_id = ? ORDER BY updated_at DESC`);
  const stmtListByBriefIdActive = db.prepare(`SELECT * FROM show_plans WHERE brief_id = ? AND active = 1 ORDER BY updated_at DESC`);

  const stmtDelete = db.prepare(`DELETE FROM show_plans WHERE id = ?`);

  function mapRowToPlan(row: Record<string, unknown>): ShowPlan {
    const planJson = row.plan_json as string;
    const plan = JSON.parse(planJson) as ShowPlan;
    // 以数据库里的 active 列为准，覆盖 JSON 里的值
    plan.active = (row.active as number) === 1;
    return plan;
  }

  return {
    async save(plan: ShowPlan): Promise<ShowPlan> {
      ShowPlanSchema.parse(plan);

      if (plan.active) {
        stmtDeactivateAll.run(plan.id);
      }

      const planJson = JSON.stringify(plan);
      stmtInsert.run({
        id: plan.id,
        version: plan.version,
        briefId: plan.briefId,
        active: plan.active ? 1 : 0,
        planJson,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      });

      return plan;
    },

    async get(id: string, version?: number): Promise<ShowPlan | null> {
      let row: Record<string, unknown> | undefined;
      if (version !== undefined) {
        row = stmtGetByVersion.get(id, version) as Record<string, unknown> | undefined;
      } else {
        row = stmtGetLatest.get(id) as Record<string, unknown> | undefined;
      }
      if (!row) return null;
      return mapRowToPlan(row);
    },

    async list(filter?: { briefId?: string; activeOnly?: boolean }): Promise<ShowPlan[]> {
      let rows: unknown[];
      if (filter?.briefId) {
        if (filter.activeOnly) {
          rows = stmtListByBriefIdActive.all(filter.briefId);
        } else {
          rows = stmtListByBriefId.all(filter.briefId);
        }
      } else {
        rows = stmtListAll.all();
      }
      return (rows as Record<string, unknown>[]).map(mapRowToPlan);
    },

    async delete(id: string): Promise<void> {
      stmtDelete.run(id);
    }
  };
}
