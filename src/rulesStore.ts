// api/src/rulesStore.ts
import { q } from "./db.js";

export type RuleSeverity = "low" | "medium" | "high" | "warn" | "critical" | "info";

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  severity: RuleSeverity | string;
  description?: string;
  params: Record<string, any>;
  type?: string;
  // Owner fields (optional, for backward compatibility)
  owner_name?: string;
  owner_email?: string;
  owner_role?: string;
  owner_notes?: string;
};

export const DEFAULT_RULES: Rule[] = [
  {
    id: "uncategorized_expenses_max",
    name: "Uncategorized expenses exceed threshold",
    enabled: true,
    severity: "medium",
    description: "Flags if uncategorized expenses total is above the threshold for the selected period.",
    params: { maxAmount: 500 },
    type: "threshold",
  },
  {
    id: "negative_income_lines",
    name: "Negative income lines exist",
    enabled: true,
    severity: "high",
    description: "Flags if revenue/income lines include negative amounts that may need review.",
    params: {},
    type: "boolean",
  },
  {
    id: "large_expense_variance_pct",
    name: "Large expense swing (percent)",
    enabled: false,
    severity: "low",
    description: "Flags if an expense category swings more than a % threshold (requires comparing prior period).",
    params: { maxPct: 25 },
    type: "percent",
  },
];

function cleanRule(x: any): Rule | null {
  if (!x) return null;
  const id = String(x.id ?? "").trim();
  const name = String(x.name ?? "").trim();
  if (!id || !name) return null;

  const severityRaw = String(x.severity ?? "low").toLowerCase();
  const severity: RuleSeverity =
    severityRaw === "high" || severityRaw === "critical"
      ? severityRaw
      : severityRaw === "medium" || severityRaw === "warn"
      ? severityRaw
      : severityRaw === "info"
      ? "info"
      : "low";

  return {
    id,
    name,
    enabled: Boolean(x.enabled),
    severity,
    description: x.description ? String(x.description) : undefined,
    params: x.params && typeof x.params === "object" ? x.params : {},
    type: x.type ? String(x.type) : undefined,
    // Owner fields (backward compatible - defaults to undefined if not present)
    owner_name: x.owner_name ? String(x.owner_name).trim() : undefined,
    owner_email: x.owner_email ? String(x.owner_email).trim() : undefined,
    owner_role: x.owner_role ? String(x.owner_role).trim() : undefined,
    owner_notes: x.owner_notes ? String(x.owner_notes).trim() : undefined,
  };
}

function cleanRules(list: any[]): Rule[] {
  return (list || [])
    .map(cleanRule)
    .filter(Boolean) as Rule[];
}


export async function getRulesForOrg(orgId: string): Promise<Rule[]> {
  try {
    const rows = await q<{ rules_json: string }>(
      `SELECT rules_json FROM org_rules WHERE org_id = $1`,
      [orgId]
    );
    const row = rows[0];
    if (!row?.rules_json) return DEFAULT_RULES;

    try {
      const parsed = JSON.parse(row.rules_json);
      if (!Array.isArray(parsed)) return DEFAULT_RULES;

      const cleaned = cleanRules(parsed);
      return cleaned.length > 0 ? cleaned : DEFAULT_RULES;
    } catch (parseError) {
      console.error("Failed to parse rules JSON:", parseError);
      return DEFAULT_RULES;
    }
  } catch (error) {
    console.error("Failed to get rules for org:", error);
    return DEFAULT_RULES;
  }
}

export async function saveRulesForOrg(orgId: string, rules: Rule[]): Promise<Rule[]> {
  const now = new Date();
  const cleaned = cleanRules(rules);

  // Never allow "empty" ruleset to accidentally wipe an org
  const toSave = cleaned.length > 0 ? cleaned : DEFAULT_RULES;

  try {
    await q(
      `INSERT INTO org_rules (org_id, rules_json, updated_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT(org_id) 
       DO UPDATE SET rules_json = EXCLUDED.rules_json, updated_at = EXCLUDED.updated_at`,
      [orgId, JSON.stringify(toSave), now]
    );
    return toSave;
  } catch (error) {
    console.error("Failed to save rules for org:", error);
    throw error;
  }
}

export async function resetRulesForOrg(orgId: string): Promise<void> {
  const now = new Date();
  try {
    await q(
      `INSERT INTO org_rules (org_id, rules_json, updated_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT(org_id) 
       DO UPDATE SET rules_json = EXCLUDED.rules_json, updated_at = EXCLUDED.updated_at`,
      [orgId, JSON.stringify(DEFAULT_RULES), now]
    );
  } catch (error) {
    console.error("Failed to reset rules for org:", error);
    throw error;
  }
}
