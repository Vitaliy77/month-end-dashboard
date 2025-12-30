// api/src/runsStore.ts
import { q } from "./db.js";

export type MonthEndRun = {
  id: string;
  org_id: string;
  from_date: string;
  to_date: string;
  net_income: number | null;
  findings_json: string; // JSON string of Finding[]
  rule_engine_version?: string;
  created_at: string;
};

// Initialize runs table (idempotent)
export async function initRunsTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS month_end_runs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      net_income NUMERIC,
      findings_json TEXT NOT NULL,
      rule_engine_version TEXT,
      created_at TEXT NOT NULL,
      CONSTRAINT unique_org_period UNIQUE(org_id, from_date, to_date)
    );
  `);
  
  // Create index for faster lookups
  await q(`
    CREATE INDEX IF NOT EXISTS idx_month_end_runs_org_period 
    ON month_end_runs(org_id, from_date, to_date);
  `);
}

export async function saveRun(run: {
  id: string;
  orgId: string;
  from: string;
  to: string;
  netIncome: number | null;
  findings: any[];
  ruleEngineVersion?: string;
}): Promise<void> {
  await initRunsTable();
  
  const now = new Date().toISOString();
  await q(
    `INSERT INTO month_end_runs 
     (id, org_id, from_date, to_date, net_income, findings_json, rule_engine_version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(org_id, from_date, to_date) 
     DO UPDATE SET 
       id = EXCLUDED.id,
       net_income = EXCLUDED.net_income,
       findings_json = EXCLUDED.findings_json,
       rule_engine_version = EXCLUDED.rule_engine_version,
       created_at = EXCLUDED.created_at`,
    [
      run.id,
      run.orgId,
      run.from,
      run.to,
      run.netIncome,
      JSON.stringify(run.findings),
      run.ruleEngineVersion || null,
      now,
    ]
  );
}

export async function getRun(
  orgId: string,
  from: string,
  to: string
): Promise<MonthEndRun | null> {
  await initRunsTable();
  
  const rows = await q<MonthEndRun>(
    `SELECT * FROM month_end_runs 
     WHERE org_id = $1 AND from_date = $2 AND to_date = $3 
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, from, to]
  );
  
  return rows[0] || null;
}

export async function listRuns(orgId: string, limit: number = 10): Promise<MonthEndRun[]> {
  await initRunsTable();
  
  return await q<MonthEndRun>(
    `SELECT * FROM month_end_runs 
     WHERE org_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [orgId, limit]
  );
}

