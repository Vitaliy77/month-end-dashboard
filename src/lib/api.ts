// web/src/lib/api.ts

export type Org = {
  id: string;
  name: string;
  created_at?: string;
};

export type Finding = {
  id: string;
  severity: "low" | "med" | "medium" | "high" | "warn" | "critical" | "info" | string;
  title: string;
  detail: string;
  summary?: string;
  qbo_link?: string | null;
  meta?: any;

  // Rule-engine extras (if returned)
  ruleId?: string;
  ruleName?: string;
  paramsUsed?: any;
  evidence?: any;
};

export type RuleSeverity =
  | "low"
  | "medium"
  | "med"
  | "high"
  | "warn"
  | "critical"
  | "info";

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  severity?: RuleSeverity | string;
  description?: string;
  type?: string;
  params?: Record<string, any>;
  // Owner fields (optional, for backward compatibility)
  owner_name?: string;
  owner_email?: string;
  owner_role?: string;
  owner_notes?: string;
};

function stripTrailingSlash(s: string) {
  return s.replace(/\/$/, "");
}

const API_BASE = (() => {
  const full =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8080";

  const prefix = process.env.NEXT_PUBLIC_API_PREFIX || "/api";
  return `${stripTrailingSlash(full)}${prefix.startsWith("/") ? "" : "/"}${prefix}`;
})();

async function asJson(resp: Response) {
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    const msg =
      json?.error ||
      json?.message ||
      (typeof json?.raw === "string" ? json.raw : null) ||
      `Request failed (${resp.status})`;
    throw new Error(msg);
  }

  return json;
}

// -------------------------
// Orgs
// -------------------------
export async function createOrg(args: { name: string }) {
  const resp = await fetch(`${API_BASE}/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  return asJson(resp);
}

export async function listOrgs(): Promise<{ ok: boolean; orgs: Org[] }> {
  const resp = await fetch(`${API_BASE}/orgs`, { cache: "no-store" });
  return asJson(resp);
}

export function qboConnectUrl(orgId: string) {
  return `${API_BASE}/auth/qbo/connect?orgId=${encodeURIComponent(orgId)}`;
}

// -------------------------
// Rules (per org)
// -------------------------
export async function getRulesForOrg(orgId: string): Promise<{ ok: boolean; orgId: string; rules: Rule[] }> {
  const resp = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/rules`, { cache: "no-store" });
  return asJson(resp);
}

export async function saveRulesForOrg(
  orgId: string,
  rules: Rule[]
): Promise<{ ok: boolean; orgId: string; rulesSaved: number }> {
  const resp = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ rules }),
  });
  return asJson(resp);
}

// -------------------------
// Month-end run
// -------------------------
export async function runMonthEndQbo(args: {
  orgId: string;
  from: string;
  to: string;
  // Optional: run with draft rules (override) without persisting
  rules?: Rule[];
}) {
  const resp = await fetch(`${API_BASE}/runs/month-end/qbo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  return asJson(resp);
}

// -------------------------
// Reports
// -------------------------
export async function loadPnl(orgId: string, from: string, to: string): Promise<any> {
  const resp = await fetch(
    `${API_BASE}/qbo/pnl?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(
      to
    )}`,
    { cache: "no-store" }
  );
  return asJson(resp);
}

export async function loadTrialBalance(orgId: string, from: string, to: string): Promise<any> {
  const resp = await fetch(
    `${API_BASE}/qbo/tb?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(
      to
    )}`,
    { cache: "no-store" }
  );
  return asJson(resp);
}

export async function loadBalanceSheet(orgId: string, from: string, to: string): Promise<any> {
  const resp = await fetch(
    `${API_BASE}/qbo/bs?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(
      to
    )}`,
    { cache: "no-store" }
  );
  return asJson(resp);
}

export async function loadCashFlow(orgId: string, from: string, to: string): Promise<any> {
  const resp = await fetch(
    `${API_BASE}/qbo/cf?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(
      to
    )}`,
    { cache: "no-store" }
  );
  return asJson(resp);
}
