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

  // Variance-specific fields (for variance_prior_month rule type)
  current_value?: number;
  prior_value?: number;
  delta?: number;
  pct_delta?: number;
  // Owner fields (can come from rule or account ownership)
  owner_name?: string;
  owner_email?: string;
  owner_role?: string;
  owner_source?: "rule" | "account" | "none";
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
  // In development, allow empty string (same-origin) or use localhost fallback
  // In production, NEXT_PUBLIC_API_BASE_URL must be set
  const full =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    (typeof window === "undefined" ? "http://127.0.0.1:8081" : ""); // Server-side fallback only

  const isProduction = process.env.NODE_ENV === "production";
  
  if (!full) {
    if (isProduction) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must be set in production");
    } else {
      console.warn(
        "[api] NEXT_PUBLIC_API_BASE_URL not set. Using same-origin (empty string). " +
        "Set NEXT_PUBLIC_API_BASE_URL in .env.local for development."
      );
    }
  }

  const prefix = process.env.NEXT_PUBLIC_API_PREFIX || "/api";
  return `${stripTrailingSlash(full)}${prefix.startsWith("/") ? "" : "/"}${prefix}`;
})();

async function asJson(resp: Response, requestUrl?: string) {
  const contentType = resp.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");
  
  const text = await resp.text();
  let json: any = null;
  
  // If response is HTML (likely a 404 page), provide a clear error
  if (isHtml && !resp.ok) {
    const url = requestUrl || resp.url;
    throw new Error(
      `API returned HTML (likely hitting Next.js 404). Check NEXT_PUBLIC_API_BASE_URL and API server.\n` +
      `Request URL: ${url}\n` +
      `Status: ${resp.status} ${resp.statusText}\n` +
      `Content-Type: ${contentType}`
    );
  }
  
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    // If parsing fails and it's not HTML, include the raw text
    if (!isHtml) {
      json = { raw: text, parseError: String(e) };
    } else {
      // Already handled HTML case above
      throw new Error(
        `API returned HTML instead of JSON. Check NEXT_PUBLIC_API_BASE_URL and API server.\n` +
        `Request URL: ${requestUrl || resp.url}\n` +
        `Status: ${resp.status} ${resp.statusText}`
      );
    }
  }

  if (!resp.ok) {
    const url = requestUrl || resp.url;
    const msg =
      json?.error ||
      json?.message ||
      (typeof json?.raw === "string" ? json.raw : null) ||
      `Request failed (${resp.status})`;
    
    // Log the request URL for debugging
    console.error(`[api] Request failed: ${url}`, {
      status: resp.status,
      statusText: resp.statusText,
      contentType,
      error: msg,
    });
    
    throw new Error(msg);
  }

  return json;
}

// -------------------------
// Orgs
// -------------------------
export async function createOrg(args: { name: string }) {
  const url = `${API_BASE}/orgs`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  return asJson(resp, url);
}

export async function listOrgs(): Promise<{ ok: boolean; orgs: Org[] }> {
  const url = `${API_BASE}/orgs`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export function qboConnectUrl(orgId: string) {
  return `${API_BASE}/auth/qbo/connect?orgId=${encodeURIComponent(orgId)}`;
}

// -------------------------
// Rules (per org)
// -------------------------
export async function getRulesForOrg(orgId: string): Promise<{ ok: boolean; orgId: string; rules: Rule[] }> {
  const url = `${API_BASE}/orgs/${encodeURIComponent(orgId)}/rules`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function saveRulesForOrg(
  orgId: string,
  rules: Rule[]
): Promise<{ ok: boolean; orgId: string; rulesSaved: number }> {
  const url = `${API_BASE}/orgs/${encodeURIComponent(orgId)}/rules`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ rules }),
  });
  return asJson(resp, url);
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
  const url = `${API_BASE}/runs/month-end/qbo`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  return asJson(resp, url);
}

// -------------------------
// Reports
// -------------------------
export async function loadPnl(orgId: string, from: string, to: string): Promise<any> {
  const url = `${API_BASE}/qbo/pnl?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function loadTrialBalance(orgId: string, from: string, to: string): Promise<any> {
  const url = `${API_BASE}/qbo/tb?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

// ✅ NEW: Balance Sheet
export async function loadBalanceSheet(orgId: string, from: string, to: string): Promise<any> {
  const url = `${API_BASE}/qbo/bs?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

// ✅ NEW: Cash Flow
export async function loadCashFlow(orgId: string, from: string, to: string): Promise<any> {
  const url = `${API_BASE}/qbo/cf?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

// -------------------------
// Series endpoints (multi-month views)
// -------------------------
export type SeriesRow = {
  account_id?: string;
  account_name: string;
  values: Record<string, number>; // colKey -> amount
};

export type SeriesResponse = {
  ok: boolean;
  orgId: string;
  from: string;
  to: string;
  months: string[]; // ["2025-09", "2025-10", ...]
  columns: string[]; // ["start", "2025-09", "2025-10", ..., "end"]
  rows: SeriesRow[];
};

export async function loadTrialBalanceSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse> {
  const url = `${API_BASE}/qbo/tb/series?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function loadBalanceSheetSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse> {
  const url = `${API_BASE}/qbo/bs/series?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function loadPnlSeries(orgId: string, from: string, to: string): Promise<SeriesResponse> {
  const url = `${API_BASE}/qbo/pnl/series?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function loadCashFlowSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse> {
  const url = `${API_BASE}/qbo/cf/series?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

// -------------------------
// Account Owners
// -------------------------
export type AccountOwner = {
  id: string;
  org_id: string;
  account_type: "tb" | "pnl" | "bs";
  account_number?: string;
  account_name_contains?: string;
  owner_name: string;
  owner_email: string;
  owner_role?: string;
  notes?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function getAccountOwnersForOrg(
  orgId: string
): Promise<{ ok: boolean; owners: AccountOwner[] }> {
  const url = `${API_BASE}/orgs/${encodeURIComponent(orgId)}/account-owners`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function saveAccountOwnersForOrg(
  orgId: string,
  owners: AccountOwner[]
): Promise<{ ok: boolean; owners: AccountOwner[] }> {
  const url = `${API_BASE}/orgs/${encodeURIComponent(orgId)}/account-owners`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ owners }),
  });
  return asJson(resp, url);
}
