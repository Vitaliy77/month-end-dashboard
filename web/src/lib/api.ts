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

function ensureProtocol(url: string): string {
  if (!url) return url;
  // If already has protocol, return as-is
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  // If starts with //, add http:
  if (url.startsWith("//")) {
    return `http:${url}`;
  }
  // If starts with /, it's a relative path - don't add protocol
  if (url.startsWith("/")) {
    return url;
  }
  // Otherwise, assume http://
  return `http://${url}`;
}

export const API_BASE = (() => {
  // In development, allow empty string (same-origin) or use localhost fallback
  // In production, NEXT_PUBLIC_API_BASE_URL must be set
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    (typeof window === "undefined" ? "http://127.0.0.1:8080" : ""); // Server-side fallback only

  const isProduction = process.env.NODE_ENV === "production";
  
  // Ensure we have a valid base URL with protocol
  let full = raw;
  if (!full) {
    if (isProduction) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must be set in production");
    } else {
      // Client-side: use same-origin (empty string means relative URLs)
      full = "";
    }
  } else {
    // Ensure protocol is present
    full = ensureProtocol(full);
    // Strip trailing slash
    full = stripTrailingSlash(full);
  }

  const prefix = process.env.NEXT_PUBLIC_API_PREFIX || "/api";
  
  // If base is empty (same-origin), just return the prefix
  if (!full) {
    return prefix.startsWith("/") ? prefix : `/${prefix}`;
  }
  
  // If base already ends with /api, don't add prefix again
  if (full.endsWith("/api")) {
    return full;
  }
  
  // Join base and prefix safely
  const joined = `${full}${prefix.startsWith("/") ? "" : "/"}${prefix}`;
  
  // Log once on client-side to verify env is loaded
  if (typeof window !== "undefined") {
    console.log("[api] API_BASE resolved:", joined);
  }
  
  return joined;
})();

// Fetch wrapper with timeout (8s) and retry (max 1)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000,
  maxRetries: number = 1
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      lastError = error;
      
      // If it's an abort (timeout) or connection error, retry once
      if (attempt < maxRetries && (error.name === "AbortError" || error.message?.includes("fetch"))) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay before retry
        continue;
      }
      
      // If connection refused or network error, throw a clear error
      if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch") || error.name === "TypeError") {
        throw new Error("API offline");
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error("Fetch failed after retries");
}

// Wrapper that catches connection errors and returns { ok: false, error: "API offline" }
async function safeFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T | { ok: false; error: string }> {
  try {
    const resp = await fetchWithTimeout(url, options);
    return await asJson<T>(resp, url);
  } catch (error: any) {
    if (error.message === "API offline" || error.message?.includes("Failed to fetch")) {
      return { ok: false, error: "API offline" } as T;
    }
    throw error;
  }
}

async function asJson<T = any>(resp: Response, requestUrl?: string): Promise<T> {
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
  const result = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  if (!result || (result as any).ok === false) {
    throw new Error((result as any)?.error || "API offline");
  }
  return result;
}

export async function listOrgs(): Promise<{ ok: boolean; orgs: Org[] }> {
  const url = `${API_BASE}/orgs`;
  const result = await safeFetch<{ ok: boolean; orgs: Org[] }>(url, { cache: "no-store" });
  if (!result || (result as any).ok === false) {
    return { ok: false, orgs: [] };
  }
  return result;
}

// Check API health (for status indicator)
export async function checkApiHealth(): Promise<{ ok: boolean; online: boolean }> {
  try {
    const url = `${API_BASE}/health`;
    const resp = await fetchWithTimeout(url, { cache: "no-store" }, 3000, 0); // 3s timeout, no retry for health check
    const json = await asJson<{ ok: boolean }>(resp, url);
    return { ok: json?.ok === true, online: true };
  } catch {
    return { ok: false, online: false };
  }
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
  const result = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });
  if (!result || (result as any).ok === false) {
    return { ok: false, error: (result as any)?.error || "API offline", findings: [], netIncome: null };
  }
  return result;
}

export async function getMonthEndRun(orgId: string, from: string, to: string): Promise<{
  ok: boolean;
  found: boolean;
  runId?: string;
  orgId?: string;
  from?: string;
  to?: string;
  netIncome?: number | null;
  findings?: Finding[];
  ruleEngineVersion?: string;
  createdAt?: string;
}> {
  const url = `${API_BASE}/runs/month-end/qbo?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const result = await safeFetch<{
    ok: boolean;
    found: boolean;
    runId?: string;
    orgId?: string;
    from?: string;
    to?: string;
    netIncome?: number | null;
    findings?: Finding[];
    ruleEngineVersion?: string;
    createdAt?: string;
  }>(url, { cache: "no-store" });
  if (!result || (result as any).ok === false) {
    return { ok: false, found: false };
  }
  return result;
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
  const result = await safeFetch<{ ok: boolean; owners: AccountOwner[] }>(url, { cache: "no-store" });
  if (!result || (result as any).ok === false) {
    return { ok: false, owners: [] };
  }
  return result;
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

// -------------------------
// Accruals
// -------------------------
export type AccrualCandidate = {
  id: string;
  org_id: string;
  period_from_date: string;
  period_to_date: string;
  vendor_name: string | null;
  account_id: string;
  account_name: string;
  expected_amount: number;
  confidence_score: number;
  explanation: {
    reason: string;
    historicalMonths: number;
    averageAmount: number;
    lastSeenDate: string | null;
    pattern: string;
  };
  status: "pending" | "approved" | "rejected";
  created_at?: string;
  updated_at?: string;
  approval?: {
    id: string;
    decision: string;
    approved_by: string | null;
    notes: string | null;
    created_at: string;
  };
  posting?: {
    id: string;
    journal_entry_id: string | null;
    posting_status: string;
    error_message: string | null;
    posted_at: string | null;
  };
};

export async function detectAccruals(
  orgId: string,
  from: string,
  to: string
): Promise<{ ok: boolean; candidatesCount: number; candidates: AccrualCandidate[] }> {
  const url = `${API_BASE}/accruals/detect`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ orgId, from, to }),
  });
  return asJson(resp, url);
}

export async function getAccrualCandidates(
  orgId: string,
  from: string,
  to: string
): Promise<{ ok: boolean; candidates: AccrualCandidate[] }> {
  const url = `${API_BASE}/accruals/candidates?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function approveAccrual(
  candidateId: string,
  orgId: string,
  decision: "approved" | "rejected",
  approvedBy?: string,
  notes?: string
): Promise<{ ok: boolean; candidateId: string; decision: string }> {
  const url = `${API_BASE}/accruals/${encodeURIComponent(candidateId)}/approve`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ orgId, decision, approvedBy, notes }),
  });
  return asJson(resp, url);
}

export async function pushAccrualToQbo(
  candidateId: string,
  orgId: string
): Promise<{ ok: boolean; journalEntryId?: string; error?: string }> {
  const url = `${API_BASE}/accruals/${encodeURIComponent(candidateId)}/push`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ orgId }),
  });
  return asJson(resp, url);
}

export async function getAccrualHistory(
  orgId: string,
  limit: number = 50
): Promise<{ ok: boolean; history: AccrualCandidate[] }> {
  const url = `${API_BASE}/accruals/history?orgId=${encodeURIComponent(orgId)}&limit=${limit}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

// -------------------------
// Accrual Rules
// -------------------------
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

export async function getAccrualRules(
  orgId: string
): Promise<{ ok: boolean; orgId: string; rules: AccrualRule }> {
  const url = `${API_BASE}/accruals/rules?orgId=${encodeURIComponent(orgId)}`;
  const resp = await fetch(url, { cache: "no-store" });
  return asJson(resp, url);
}

export async function saveAccrualRules(
  orgId: string,
  rules: Partial<Omit<AccrualRule, "org_id" | "updated_at">>
): Promise<{ ok: boolean; orgId: string; rules: AccrualRule }> {
  const url = `${API_BASE}/accruals/rules`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ 
      orgId, 
      lookback_months: rules.lookback_months,
      min_amount: rules.min_amount,
      confidence_threshold: rules.confidence_threshold,
      min_recurrence_count: rules.min_recurrence_count,
      excluded_accounts: rules.excluded_accounts,
      excluded_vendors: rules.excluded_vendors,
      include_accounts: rules.include_accounts,
    }),
  });
  return asJson(resp, url);
}

export async function resetAccrualRulesToDefaults(
  orgId: string
): Promise<{ ok: boolean; orgId: string; rules: AccrualRule }> {
  const url = `${API_BASE}/accruals/rules/reset`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ orgId }),
  });
  return asJson(resp, url);
}
