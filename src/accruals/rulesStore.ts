// api/src/accruals/rulesStore.ts
import { q } from "../db.js";

export type AccrualRule = {
  org_id: string;
  lookback_months: number;
  min_amount: number;
  confidence_threshold: number;
  min_recurrence_count: number;
  excluded_accounts: string[];
  excluded_vendors: string[];
  include_accounts: string[];
  updated_at: string;
};

const DEFAULT_RULES: Omit<AccrualRule, "org_id" | "updated_at"> = {
  lookback_months: 6,
  min_amount: 50,
  confidence_threshold: 0.7,
  min_recurrence_count: 3,
  excluded_accounts: [],
  excluded_vendors: [],
  include_accounts: [],
};

export async function getAccrualRules(orgId: string): Promise<AccrualRule> {
  const result = await q<AccrualRule>(
    `SELECT * FROM accrual_rules WHERE org_id = $1`,
    [orgId]
  );

  if (!result || result.length === 0) {
    // Return defaults if not found
    return {
      org_id: orgId,
      ...DEFAULT_RULES,
      updated_at: new Date().toISOString(),
    };
  }

  const row = result[0];
  // Ensure arrays are always arrays (handle null/undefined from DB)
  return {
    ...row,
    excluded_accounts: Array.isArray(row.excluded_accounts) ? row.excluded_accounts : [],
    excluded_vendors: Array.isArray(row.excluded_vendors) ? row.excluded_vendors : [],
    include_accounts: Array.isArray(row.include_accounts) ? row.include_accounts : [],
  };
}

export async function saveAccrualRules(
  orgId: string,
  rules: Partial<Omit<AccrualRule, "org_id" | "updated_at">>
): Promise<AccrualRule> {
  const existing = await getAccrualRules(orgId);

  const merged: AccrualRule = {
    org_id: orgId,
    lookback_months: rules.lookback_months ?? existing.lookback_months,
    min_amount: rules.min_amount ?? existing.min_amount,
    confidence_threshold: rules.confidence_threshold ?? existing.confidence_threshold,
    min_recurrence_count: rules.min_recurrence_count ?? existing.min_recurrence_count,
    excluded_accounts: Array.isArray(rules.excluded_accounts) ? rules.excluded_accounts : (rules.excluded_accounts ?? existing.excluded_accounts),
    excluded_vendors: Array.isArray(rules.excluded_vendors) ? rules.excluded_vendors : (rules.excluded_vendors ?? existing.excluded_vendors),
    include_accounts: Array.isArray(rules.include_accounts) ? rules.include_accounts : (rules.include_accounts ?? existing.include_accounts),
    updated_at: new Date().toISOString(),
  };

  await q(
    `INSERT INTO accrual_rules (
      org_id, lookback_months, min_amount, confidence_threshold,
      min_recurrence_count, excluded_accounts, excluded_vendors,
      include_accounts, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (org_id) DO UPDATE SET
      lookback_months = EXCLUDED.lookback_months,
      min_amount = EXCLUDED.min_amount,
      confidence_threshold = EXCLUDED.confidence_threshold,
      min_recurrence_count = EXCLUDED.min_recurrence_count,
      excluded_accounts = EXCLUDED.excluded_accounts,
      excluded_vendors = EXCLUDED.excluded_vendors,
      include_accounts = EXCLUDED.include_accounts,
      updated_at = EXCLUDED.updated_at`,
    [
      merged.org_id,
      merged.lookback_months,
      merged.min_amount,
      merged.confidence_threshold,
      merged.min_recurrence_count,
      merged.excluded_accounts,
      merged.excluded_vendors,
      merged.include_accounts,
      merged.updated_at,
    ]
  );

  // Return the saved rule (re-fetch to ensure consistency)
  return getAccrualRules(orgId);
}

export async function resetAccrualRulesToDefaults(orgId: string): Promise<AccrualRule> {
  return saveAccrualRules(orgId, DEFAULT_RULES);
}

