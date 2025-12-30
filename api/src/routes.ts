// api/src/routes.ts
import { Router } from "express";
import crypto from "node:crypto";
import { q } from "./db.js";
import { ENV } from "./env.js";
import { buildAuthUrl, exchangeCodeForTokens, refreshAccessToken } from "./qboAuth.js";
import { findNetIncome } from "./qbo/pnlParse.js";
import { monthBuckets, priorDay, type MonthBucket } from "./monthBuckets.js";

// === Rules system ===
import { getRulesForOrg, saveRulesForOrg } from "./rulesStore.js";
import { evaluateRules, RULE_ENGINE_VERSION } from "./ruleEngine.js";
// === Runs system ===
import { saveRun, getRun, listRuns } from "./runsStore.js";
// === Account Owners system ===
import {
  getAccountOwnersForOrg,
  saveAccountOwnersForOrg,
  resolveOwnerForAccount,
  type AccountOwner,
} from "./accountOwnersStore.js";
// === Account Owners system ===
import {
  getAccountOwnersForOrg,
  saveAccountOwnersForOrg,
  resolveOwnerForAccount,
  type AccountOwner,
} from "./accountOwnersStore.js";

export const routes = Router();

/** Helpers to normalize q() return shapes */
function rowsOf(result: any) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.data)) return result.data;
  return [];
}
function firstRow(result: any) {
  const r = rowsOf(result);
  return r[0] || null;
}

// Debug: show what ENV the API sees
routes.get("/debug/env", (_req, res) => {
  res.json({
    ok: true,
    QBO_REDIRECT_URI: ENV.QBO_REDIRECT_URI,
    APP_BASE_URL: ENV.APP_BASE_URL,
    WEB_BASE_URL: ENV.WEB_BASE_URL,
    QBO_BASE_URL: ENV.QBO_BASE_URL,
    QBO_ENV: ENV.QBO_ENV,
  });
});

// Debug: list all registered routes (dev only)
routes.get("/debug/routes", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  
  const routeList: Array<{ method: string; path: string }> = [];
  
  // Walk through the router stack to extract routes
  routes.stack.forEach((layer: any) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      methods.forEach(method => {
        routeList.push({
          method,
          path: layer.route.path,
        });
      });
    } else if (layer.name === "router") {
      // Handle nested routers
      layer.handle.stack?.forEach((nestedLayer: any) => {
        if (nestedLayer.route) {
          const methods = Object.keys(nestedLayer.route.methods).map(m => m.toUpperCase());
          methods.forEach(method => {
            routeList.push({
              method,
              path: nestedLayer.route.path,
            });
          });
        }
      });
    }
  });
  
  res.json({
    ok: true,
    routes: routeList.sort((a, b) => a.path.localeCompare(b.path)),
    count: routeList.length,
  });
});

// Debug: QBO configuration (dev-only, no secrets)
routes.get("/debug/qbo", (_req, res) => {
  // Only enable in non-production
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const clientId = ENV.QBO_CLIENT_ID || "";
  const clientSecret = ENV.QBO_CLIENT_SECRET || "";
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${clientId}:${clientSecret}`)
    .digest("hex")
    .slice(0, 8);

  res.json({
    qbo_env: ENV.QBO_ENV,
    redirect_uri: ENV.QBO_REDIRECT_URI,
    client_id_len: clientId.length,
    client_id_last6: clientId.length >= 6 ? clientId.slice(-6) : "N/A",
    client_secret_len: clientSecret.length,
    client_secret_last4: clientSecret.length >= 4 ? clientSecret.slice(-4) : "N/A",
    fingerprint8: fingerprint,
  });
});

// Debug: QBO credentials verification (dev-only, no secrets)
routes.get("/debug/qbo-creds", (_req, res) => {
  // Only enable in non-production
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const clientId = ENV.QBO_CLIENT_ID || "";
  const clientSecret = ENV.QBO_CLIENT_SECRET || "";
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${clientId}:${clientSecret}`)
    .digest("hex")
    .slice(0, 8);

  res.json({
    qbo_env: ENV.QBO_ENV,
    redirect_uri: ENV.QBO_REDIRECT_URI,
    client_id_length: clientId.length,
    client_id_last6: clientId.length >= 6 ? clientId.slice(-6) : "N/A",
    client_secret_length: clientSecret.length,
    client_secret_last2: clientSecret.length >= 2 ? clientSecret.slice(-2) : "N/A",
    fingerprint_sha256_first8: fingerprint,
  });
});

// -------------------------
// Orgs (DB-backed)
// -------------------------
routes.get("/orgs", async (_req, res) => {
  try {
    const result: any = await q(
      `select id, name, created_at
       from orgs
       order by created_at desc
       limit 200`,
      []
    );
    const orgs = rowsOf(result);
    return res.json({
      ok: true,
      count: orgs.length,
      orgs,
    });
  } catch (e: any) {
    console.error("GET /orgs failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.post("/orgs", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Missing name" });

    const id = crypto.randomUUID();
    const result: any = await q(
      `insert into orgs (id, name)
       values ($1, $2)
       returning id, name, created_at`,
      [id, name]
    );
    const org = firstRow(result);
    return res.json({ ok: true, org });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -------------------------
// QBO OAuth routes
// -------------------------
routes.get("/auth/qbo/connect", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });

    console.log("[routes] GET /auth/qbo/connect - orgId:", orgId);
    const result = await buildAuthUrl(orgId);
    console.log("[routes] Redirecting to Intuit authorize URL");
    return res.redirect(result.url);
  } catch (e: any) {
    console.error("[routes] /auth/qbo/connect error:", e?.message || String(e));
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/auth/qbo/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const realmId = String(req.query.realmId || "");
    const state = String(req.query.state || "");

    // Log callback params (safe, no secrets)
    console.log("[routes] GET /auth/qbo/callback");
    console.log("[routes] Callback params - code:", code ? "***PRESENT***" : "MISSING");
    console.log("[routes] Callback params - realmId:", realmId || "MISSING");
    console.log("[routes] Callback params - state:", state ? "***PRESENT***" : "MISSING");

    if (!code || !realmId || !state) {
      console.error("[routes] Missing required callback params");
      return res.status(400).send("Missing code/realmId/state");
    }

    // 1) Look up orgId from oauth_states
    const stateResult: any = await q(
      `select org_id as "orgId" from oauth_states where state = $1 limit 1`,
      [state]
    );
    const stateRow = firstRow(stateResult);
    const orgId = stateRow?.orgId;
    if (!orgId) return res.status(400).send("Invalid or expired state");

    // 2) Exchange code -> tokens (IMPORTANT: pass code string)
    const tokens = await exchangeCodeForTokens(code);

    // 3) Persist connection (realmId + tokens)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Number(tokens.expires_in) * 1000);
    const refreshExpiresAt = new Date(
      now.getTime() + Number(tokens.x_refresh_token_expires_in) * 1000
    );

    await q(
      `insert into qbo_connections
        (org_id, realm_id, access_token, refresh_token, expires_at, refresh_expires_at, created_at, updated_at)
       values
        ($1,$2,$3,$4,$5,$6, now(), now())
       on conflict (org_id) do update set
        realm_id = excluded.realm_id,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        refresh_expires_at = excluded.refresh_expires_at,
        updated_at = now()`,
      [orgId, realmId, tokens.access_token, tokens.refresh_token, expiresAt, refreshExpiresAt]
    );

    // 4) Delete used state (recommended)
    await q(`delete from oauth_states where state = $1`, [state]);

    const web = ENV.WEB_BASE_URL;
    if (!web) {
      console.error("[routes] WEB_BASE_URL not set, cannot redirect");
      return res.status(500).json({ ok: false, error: "WEB_BASE_URL not configured" });
    }
    console.log("[routes] Redirecting to web:", `${web}/?connected=1&orgId=${encodeURIComponent(orgId)}`);
    return res.redirect(`${web}/?connected=1&orgId=${encodeURIComponent(orgId)}`);
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[routes] /auth/qbo/callback error:", msg);
    return res.status(500).send(`QBO callback error: ${msg}`);
  }
});

// -------------------------
// QBO data helpers
// -------------------------
async function ensureFreshAccessToken(orgId: string) {
  // Pull current connection
  const connResult: any = await q(
    `select access_token as "accessToken",
            refresh_token as "refreshToken",
            expires_at as "expiresAt",
            refresh_expires_at as "refreshExpiresAt",
            realm_id as "realmId"
     from qbo_connections
     where org_id = $1
     limit 1`,
    [orgId]
  );
  const conn = firstRow(connResult);
  if (!conn?.realmId) throw new Error("No QBO connection for org. Connect QBO first.");

  const expiresAt = conn.expiresAt ? new Date(conn.expiresAt) : null;
  const now = Date.now();

  // Refresh if expired (or expires within 60 seconds)
  if (expiresAt && expiresAt.getTime() - now > 60_000 && conn.accessToken) {
    return { accessToken: conn.accessToken as string, realmId: conn.realmId as string };
  }

  if (!conn.refreshToken) throw new Error("Missing refresh token. Reconnect QBO.");

  const refreshed = await refreshAccessToken(conn.refreshToken as string);

  const newAccess = refreshed.access_token;
  const newRefresh = refreshed.refresh_token || (conn.refreshToken as string);

  const newExpiresAt = new Date(Date.now() + Number(refreshed.expires_in) * 1000);
  const newRefreshExpiresAt = refreshed.x_refresh_token_expires_in
    ? new Date(Date.now() + Number(refreshed.x_refresh_token_expires_in) * 1000)
    : (conn.refreshExpiresAt ? new Date(conn.refreshExpiresAt) : null);

  await q(
    `update qbo_connections
     set access_token = $2,
         refresh_token = $3,
         expires_at = $4,
         refresh_expires_at = $5,
         updated_at = now()
     where org_id = $1`,
    [orgId, newAccess, newRefresh, newExpiresAt, newRefreshExpiresAt]
  );

  return { accessToken: newAccess, realmId: conn.realmId as string };
}

async function qboFetchJson(orgId: string, path: string, queryParams?: Record<string, string>) {
  const base = ENV.QBO_BASE_URL;
  const { accessToken, realmId } = await ensureFreshAccessToken(orgId);

  const url = new URL(`${base}/v3/company/${realmId}${path}`);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  }

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`QBO fetch failed ${r.status}: ${text || r.statusText}`);
  }

  return await r.json();
}

// -------------------------
// QBO data routes
// -------------------------
routes.get("/qbo/pnl", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const pnl = await qboFetchJson(orgId, "/reports/ProfitAndLoss", {
      start_date: from,
      end_date: to,
    });

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      pnl,
      netIncome: findNetIncome(pnl),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET endpoint to retrieve last run for orgId+period
routes.get("/runs/month-end/qbo", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const run = await getRun(orgId, from, to);
    if (!run) {
      return res.json({
        ok: true,
        found: false,
        orgId,
        from,
        to,
      });
    }

    // Parse findings JSON
    let findings: any[] = [];
    try {
      findings = JSON.parse(run.findings_json);
    } catch {
      findings = [];
    }

    return res.json({
      ok: true,
      found: true,
      runId: run.id,
      orgId: run.org_id,
      from: run.from_date,
      to: run.to_date,
      netIncome: run.net_income,
      findings,
      ruleEngineVersion: run.rule_engine_version,
      createdAt: run.created_at,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/tb", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const tb = await qboFetchJson(orgId, "/reports/TrialBalance", {
      start_date: from,
      end_date: to,
    });

    // Count rows for debugging
    const rows = tb?.Rows?.Row || [];
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const rowsWithColData = Array.isArray(rows)
      ? rows.filter((r: any) => Array.isArray(r?.ColData)).length
      : 0;

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      tb,
      count: rowCount,
      countWithColData: rowsWithColData,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/bs", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const bs = await qboFetchJson(orgId, "/reports/BalanceSheet", {
      start_date: from,
      end_date: to,
    });

    return res.json({ ok: true, orgId, from, to, bs });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/cf", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const cf = await qboFetchJson(orgId, "/reports/CashFlow", {
      start_date: from,
      end_date: to,
    });

    return res.json({ ok: true, orgId, from, to, cf });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -------------------------
// Series endpoints (multi-month views)
// -------------------------

// Helper to extract account rows from QBO report
function extractAccountRows(report: any): Array<{ account_id?: string; account_name: string; amount: number }> {
  const rows: Array<{ account_id?: string; account_name: string; amount: number }> = [];
  
  function toNumber(v: any): number | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    // Handle QBO format: "(123.45)" for negatives, "$", commas
    const negByParens = /^\(.*\)$/.test(s);
    const cleaned = s.replace(/[(),$]/g, "").replace(/,/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return negByParens ? -n : n;
  }
  
  function processRow(row: any, path: string[] = []) {
    if (!row) return;
    
    const cols = row.ColData || row.Header?.ColData || row.Summary?.ColData || [];
    if (!Array.isArray(cols) || cols.length === 0) {
      // Try children
      if (row.Rows?.Row) {
        for (const child of row.Rows.Row) {
          processRow(child, path);
        }
      }
      return;
    }
    
    const label = cols[0]?.value || "";
    const accountId = cols[0]?.id;
    
    // Get amount from last numeric column (usually the total)
    let amount = 0;
    for (let i = cols.length - 1; i >= 1; i--) {
      const num = toNumber(cols[i]?.value);
      if (num !== null) {
        amount = num;
        break;
      }
    }
    
    // Only include data rows with labels (skip totals/sections without meaningful names)
    if (label && label.trim() && (row.type === "Data" || (row.type === "Section" && amount !== 0))) {
      const fullPath = path.length > 0 ? [...path, label].join(" / ") : label;
      rows.push({
        account_id: accountId,
        account_name: fullPath,
        amount,
      });
    }
    
    // Process children
    if (row.Rows?.Row && Array.isArray(row.Rows.Row)) {
      const nextPath = label && label.trim() ? [...path, label] : path;
      for (const child of row.Rows.Row) {
        processRow(child, nextPath);
      }
    }
  }
  
  if (report?.Rows?.Row && Array.isArray(report.Rows.Row)) {
    for (const row of report.Rows.Row) {
      processRow(row);
    }
  }
  
  return rows;
}

// Helper to fetch and cache reports (in-memory cache per request)
async function fetchReportCached(
  cache: Map<string, any>,
  orgId: string,
  reportType: "TrialBalance" | "BalanceSheet" | "ProfitAndLoss" | "CashFlow",
  from: string,
  to: string
): Promise<any> {
  const cacheKey = `${reportType}:${from}:${to}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const report = await qboFetchJson(orgId, `/reports/${reportType}`, {
    start_date: from,
    end_date: to,
  });
  
  cache.set(cacheKey, report);
  return report;
}

routes.get("/qbo/tb/series", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const buckets = monthBuckets(from, to);
    const months = buckets.map((b) => b.key);
    const prior = priorDay(from);
    const cache = new Map<string, any>();

    // Fetch starting balance (as of prior day) - use prior as both start and end
    const startReport = await fetchReportCached(cache, orgId, "TrialBalance", prior, prior);
    const startRows = extractAccountRows(startReport);

    // Fetch each month - for balance reports, use month-end as both start and end to get "as of" balance
    const monthReports = await Promise.all(
      buckets.map((bucket) => {
        // Use bucket.to (month end) as both start and end to get balance as of that date
        return fetchReportCached(cache, orgId, "TrialBalance", bucket.to, bucket.to);
      })
    );
    const monthRows = monthReports.map((r) => extractAccountRows(r));

    // Fetch ending balance (as of end date) - use to as both start and end
    const endReport = await fetchReportCached(cache, orgId, "TrialBalance", to, to);
    const endRows = extractAccountRows(endReport);

    // Combine all accounts
    const accountMap = new Map<string, { account_id?: string; account_name: string; values: Record<string, number> }>();

    [startRows, ...monthRows, endRows].forEach((rows, idx) => {
      const colKey = idx === 0 ? "start" : idx === monthRows.length + 1 ? "end" : months[idx - 1];
      rows.forEach((row) => {
        const key = row.account_name;
        if (!accountMap.has(key)) {
          accountMap.set(key, { account_id: row.account_id, account_name: row.account_name, values: {} });
        }
        accountMap.get(key)!.values[colKey] = row.amount;
      });
    });

    const rows = Array.from(accountMap.values());

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      months,
      columns: ["start", ...months, "end"],
      rows,
    });
  } catch (e: any) {
    console.error("GET /qbo/tb/series failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/bs/series", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const buckets = monthBuckets(from, to);
    const months = buckets.map((b) => b.key);
    const prior = priorDay(from);
    const cache = new Map<string, any>();

    // Fetch starting balance (as of prior day) - use prior as both start and end
    const startReport = await fetchReportCached(cache, orgId, "BalanceSheet", prior, prior);
    const startRows = extractAccountRows(startReport);

    // Fetch each month - for balance reports, use month-end as both start and end to get "as of" balance
    const monthReports = await Promise.all(
      buckets.map((bucket) => {
        // Use bucket.to (month end) as both start and end to get balance as of that date
        return fetchReportCached(cache, orgId, "BalanceSheet", bucket.to, bucket.to);
      })
    );
    const monthRows = monthReports.map((r) => extractAccountRows(r));

    // Fetch ending balance (as of end date) - use to as both start and end
    const endReport = await fetchReportCached(cache, orgId, "BalanceSheet", to, to);
    const endRows = extractAccountRows(endReport);

    // Combine all accounts
    const accountMap = new Map<string, { account_id?: string; account_name: string; values: Record<string, number> }>();

    [startRows, ...monthRows, endRows].forEach((rows, idx) => {
      const colKey = idx === 0 ? "start" : idx === monthRows.length + 1 ? "end" : months[idx - 1];
      rows.forEach((row) => {
        const key = row.account_name;
        if (!accountMap.has(key)) {
          accountMap.set(key, { account_id: row.account_id, account_name: row.account_name, values: {} });
        }
        accountMap.get(key)!.values[colKey] = row.amount;
      });
    });

    const rows = Array.from(accountMap.values());

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      months,
      columns: ["start", ...months, "end"],
      rows,
    });
  } catch (e: any) {
    console.error("GET /qbo/bs/series failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/pnl/series", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const buckets = monthBuckets(from, to);
    const months = buckets.map((b) => b.key);
    const cache = new Map<string, any>();

    // P&L: Start = 0, fetch each month, End = sum of months
    const monthReports = await Promise.all(
      buckets.map((bucket) => fetchReportCached(cache, orgId, "ProfitAndLoss", bucket.from, bucket.to))
    );
    const monthRows = monthReports.map((r) => extractAccountRows(r));

    // Combine all accounts
    const accountMap = new Map<string, { account_id?: string; account_name: string; values: Record<string, number> }>();

    monthRows.forEach((rows, idx) => {
      const colKey = months[idx];
      rows.forEach((row) => {
        const key = row.account_name;
        if (!accountMap.has(key)) {
          accountMap.set(key, { account_id: row.account_id, account_name: row.account_name, values: { start: 0 } });
        }
        accountMap.get(key)!.values[colKey] = (accountMap.get(key)!.values[colKey] || 0) + row.amount;
      });
    });

    // Calculate end = sum of months
    accountMap.forEach((account) => {
      const monthSum = months.reduce((sum, month) => sum + (account.values[month] || 0), 0);
      account.values.end = monthSum;
    });

    const rows = Array.from(accountMap.values());

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      months,
      columns: ["start", ...months, "end"],
      rows,
    });
  } catch (e: any) {
    console.error("GET /qbo/pnl/series failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.get("/qbo/cf/series", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const buckets = monthBuckets(from, to);
    const months = buckets.map((b) => b.key);
    const cache = new Map<string, any>();

    // Cash Flow: Start = 0, fetch each month, End = sum of months
    const monthReports = await Promise.all(
      buckets.map((bucket) => fetchReportCached(cache, orgId, "CashFlow", bucket.from, bucket.to))
    );
    const monthRows = monthReports.map((r) => extractAccountRows(r));

    // Combine all accounts
    const accountMap = new Map<string, { account_id?: string; account_name: string; values: Record<string, number> }>();

    monthRows.forEach((rows, idx) => {
      const colKey = months[idx];
      rows.forEach((row) => {
        const key = row.account_name;
        if (!accountMap.has(key)) {
          accountMap.set(key, { account_id: row.account_id, account_name: row.account_name, values: { start: 0 } });
        }
        accountMap.get(key)!.values[colKey] = (accountMap.get(key)!.values[colKey] || 0) + row.amount;
      });
    });

    // Calculate end = sum of months
    accountMap.forEach((account) => {
      const monthSum = months.reduce((sum, month) => sum + (account.values[month] || 0), 0);
      account.values.end = monthSum;
    });

    const rows = Array.from(accountMap.values());

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      months,
      columns: ["start", ...months, "end"],
      rows,
    });
  } catch (e: any) {
    console.error("GET /qbo/cf/series failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -------------------------
// Rules routes
// -------------------------
routes.get("/orgs/:orgId/rules", async (req, res) => {
  try {
    const orgId = String(req.params.orgId || "");
    const rules = await getRulesForOrg(orgId);
    return res.json({ ok: true, orgId, rules });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.post("/orgs/:orgId/rules", async (req, res) => {
  try {
    const orgId = String(req.params.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    console.log("[routes] POST /orgs/:orgId/rules:", { orgId, ruleCount: rules.length });
    const saved = await saveRulesForOrg(orgId, rules);
    console.log("[routes] Rules saved:", { orgId, savedCount: saved.length });
    return res.json({ ok: true, orgId, rules: saved, rulesSaved: saved.length });
  } catch (e: any) {
    console.error("POST /orgs/:orgId/rules failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Also support PUT for compatibility with frontend
routes.put("/orgs/:orgId/rules", async (req, res) => {
  try {
    const orgId = String(req.params.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const saved = await saveRulesForOrg(orgId, rules);
    return res.json({ ok: true, orgId, rules: saved, rulesSaved: saved.length });
  } catch (e: any) {
    console.error("PUT /orgs/:orgId/rules failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -------------------------
// Account Owners endpoints
// -------------------------
routes.get("/orgs/:orgId/account-owners", async (req, res) => {
  try {
    const orgId = String(req.params.orgId || "");
    const owners = await getAccountOwnersForOrg(orgId);
    return res.json({ ok: true, owners });
  } catch (e: any) {
    console.error("GET /orgs/:orgId/account-owners failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

routes.post("/orgs/:orgId/account-owners", async (req, res) => {
  try {
    const orgId = String(req.params.orgId || "");
    const owners = Array.isArray(req.body?.owners) ? req.body.owners : [];
    const ok = await saveAccountOwnersForOrg(orgId, owners);
    if (ok) {
      const saved = await getAccountOwnersForOrg(orgId);
      return res.json({ ok: true, owners: saved });
    }
    return res.status(500).json({ ok: false, error: "Failed to save account owners" });
  } catch (e: any) {
    console.error("POST /orgs/:orgId/account-owners failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -------------------------
// Month-end run
// -------------------------
// Helper to calculate prior month date range
function priorMonthRange(from: string, to: string) {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, f.getUTCDate()));
  const pt = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, t.getUTCDate()));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(pf), to: fmt(pt) };
}

routes.post("/runs/month-end/qbo", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    const from = String(req.body?.from || "");
    const to = String(req.body?.to || "");
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    // Support custom rules passed in request body (for draft rules)
    const customRules = Array.isArray(req.body?.rules) ? req.body.rules : undefined;
    const rules = customRules || await getRulesForOrg(orgId);

    // Check if any rule needs prior month data (variance_prior_month type)
    const needsPriorMonth = rules.some((r) => r.type === "variance_prior_month" && r.enabled);
    console.log("[variance_debug] Month-end run:", {
      orgId,
      periodFrom: from,
      periodTo: to,
      needsPriorMonth,
      totalRules: rules.length,
      varianceRules: rules.filter((r) => r.type === "variance_prior_month").map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        account_selector: r.params?.account_selector,
      })),
    });

    // Fetch current period data
    const pnl = await qboFetchJson(orgId, "/reports/ProfitAndLoss", {
      start_date: from,
      end_date: to,
    });

    const pnlRowsCount = pnl?.Rows?.Row?.length || 0;
    console.log("[variance_debug] Current P&L fetched:", {
      rowsCount: pnlRowsCount,
      hasRows: !!pnl?.Rows?.Row,
    });

    // Fetch prior month data if needed
    let pnlPrior: any = null;
    if (needsPriorMonth) {
      const priorRange = priorMonthRange(from, to);
      console.log("[variance_debug] Fetching prior month:", priorRange);
      try {
        pnlPrior = await qboFetchJson(orgId, "/reports/ProfitAndLoss", {
          start_date: priorRange.from,
          end_date: priorRange.to,
        });
        const pnlPriorRowsCount = pnlPrior?.Rows?.Row?.length || 0;
        console.log("[variance_debug] Prior P&L fetched:", {
          rowsCount: pnlPriorRowsCount,
          hasRows: !!pnlPrior?.Rows?.Row,
        });
      } catch (priorError: any) {
        console.warn("[variance_debug] Failed to fetch prior month P&L:", priorError?.message);
        // Continue without prior month data - variance rules will be skipped
      }
    } else {
      console.log("[variance_debug] Skipping prior month fetch (no variance rules enabled)");
    }

    // Load account owners for owner inheritance
    const accountOwners = await getAccountOwnersForOrg(orgId);

    const findings = evaluateRules({ pnl, pnlPrior, rules, from, to, accountOwners });
    const netIncome = findNetIncome(pnl);
    const runId = crypto.randomUUID();

    // Save run to database
    try {
      await saveRun({
        id: runId,
        orgId,
        from,
        to,
        netIncome,
        findings,
        ruleEngineVersion: RULE_ENGINE_VERSION,
      });
    } catch (saveError: any) {
      console.error("Failed to save run:", saveError);
      // Non-fatal: continue even if save fails
    }

    return res.json({
      ok: true,
      runId,
      orgId,
      from,
      to,
      netIncome,
      netIncomeValue: netIncome, // alias for frontend compatibility
      findings,
      ruleEngineVersion: RULE_ENGINE_VERSION,
    });
  } catch (e: any) {
    console.error("POST /runs/month-end/qbo failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
