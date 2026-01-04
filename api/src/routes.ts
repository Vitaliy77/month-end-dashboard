// api/src/routes.ts
import { Router } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { q } from "./db.js";
import { ENV } from "./env.js";
import { buildAuthUrl, exchangeCodeForTokens, refreshAccessToken } from "./qboAuth.js";
import { findNetIncome } from "./qbo/pnlParse.js";
import { monthBuckets, priorDay, type MonthBucket } from "./monthBuckets.js";
import { parseCSV } from "./recon/csvParser.js";
import {
  createStatement,
  insertStatementLines,
  listStatements,
  getStatementWithCounts,
  listStatementLines,
  updateLineMatchStatus,
  updateLineReceipt,
} from "./recon/store.js";
import { qboFetchForOrg } from "./lib/qboFetchForOrg.js";

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

    // API-side sanity check for single-month endpoints
    const columns = pnl?.Columns?.Column || [];
    const columnTitles = columns.map((c: any) => c?.ColTitle || "").filter(Boolean);
    const firstRow = pnl?.Rows?.Row?.[0];
    const firstRowColDataLen = firstRow?.ColData?.length || 0;
    
    console.log("[SINGLE_PNL_API_CHECK]", {
      orgId,
      from,
      to,
      columnTitles,
      columnCount: columns.length,
      firstRowType: firstRow?.type,
      firstRowColDataLen,
      hasRows: !!pnl?.Rows?.Row?.length,
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

    // API-side sanity check for single-month endpoints
    const columns = bs?.Columns?.Column || [];
    const columnTitles = columns.map((c: any) => c?.ColTitle || "").filter(Boolean);
    const firstRow = bs?.Rows?.Row?.[0];
    const firstRowColDataLen = firstRow?.ColData?.length || 0;
    
    console.log("[SINGLE_BS_API_CHECK]", {
      orgId,
      from,
      to,
      columnTitles,
      columnCount: columns.length,
      firstRowType: firstRow?.type,
      firstRowColDataLen,
      hasRows: !!bs?.Rows?.Row?.length,
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

    // API-side sanity check for single-month endpoints
    const columns = cf?.Columns?.Column || [];
    const columnTitles = columns.map((c: any) => c?.ColTitle || "").filter(Boolean);
    const firstRow = cf?.Rows?.Row?.[0];
    const firstRowColDataLen = firstRow?.ColData?.length || 0;
    
    console.log("[SINGLE_CF_API_CHECK]", {
      orgId,
      from,
      to,
      columnTitles,
      columnCount: columns.length,
      firstRowType: firstRow?.type,
      firstRowColDataLen,
      hasRows: !!cf?.Rows?.Row?.length,
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

  // prior month start = first day of previous month
  const priorStart = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1));

  // prior month end = last day of previous month:
  // day 0 of current month gives last day of previous month
  const priorEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(priorStart), to: fmt(priorEnd) };
}

routes.post("/runs/month-end/qbo", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    const from = String(req.body?.from || "");
    const to = String(req.body?.to || "");
    const force = String(req.query?.force || "").toLowerCase() === "true";
    
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    console.log("[MONTH_END_RUN]", { orgId, from, to, force, mode: force ? "RECOMPUTE" : "SAVED_OR_NEW" });

    // If not forcing, check for saved run first
    if (!force) {
      const savedRun = await getRun(orgId, from, to);
      if (savedRun) {
        // Parse findings JSON
        let findings: any[] = [];
        try {
          findings = JSON.parse(savedRun.findings_json);
        } catch {
          findings = [];
        }

        return res.json({
          ok: true,
          wasForced: false,
          runId: savedRun.id,
          orgId: savedRun.org_id,
          from: savedRun.from_date,
          to: savedRun.to_date,
          netIncome: savedRun.net_income,
          netIncomeValue: savedRun.net_income, // alias for frontend compatibility
          findings,
          ruleEngineVersion: savedRun.rule_engine_version,
          createdAt: savedRun.created_at,
        });
      }
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
      wasForced: force,
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

// -------------------------
// Accruals routes
// -------------------------
import {
  detectAccrualCandidates,
  type AccrualCandidate,
} from "./accruals/detection.js";
import {
  saveAccrualCandidates,
  getAccrualCandidates,
  getAccrualCandidateById,
  approveAccrualCandidate,
  getAccrualHistory,
} from "./accruals/store.js";
import { pushAccrualToQbo } from "./accruals/qboPush.js";
import {
  getAccrualRules,
  saveAccrualRules,
  resetAccrualRulesToDefaults,
  type AccrualRule,
} from "./accruals/rulesStore.js";
import { qboFetchForOrg } from "./lib/qboFetchForOrg.js";

// Helper function for dry-run (needs to be accessible)
async function findOrCreateAccrualLiabilityAccount(orgId: string): Promise<string> {
  const { getValidQboConnection, qboApiBase } = await import("./lib/qboFetchForOrg.js");
  try {
    const conn = await getValidQboConnection(orgId);
    const base = qboApiBase(conn.realm_id);

    // Try to find existing Accrued Liabilities account
    const queryUrl = `${base}/query?query=SELECT * FROM Account WHERE AccountType = 'Other Current Liability' AND Name = 'Accrued Liabilities' MAXRESULTS 1`;
    const resp = await fetch(queryUrl, {
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        Accept: "application/json",
      },
    });

    if (resp.ok) {
      const accounts = await resp.json();
      if (accounts.QueryResponse?.Account?.[0]?.Id) {
        return accounts.QueryResponse.Account[0].Id;
      }
    }

    // If not found, try Accounts Payable
    const apQueryUrl = `${base}/query?query=SELECT * FROM Account WHERE AccountType = 'Accounts Payable' MAXRESULTS 1`;
    const apResp = await fetch(apQueryUrl, {
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        Accept: "application/json",
      },
    });

    if (apResp.ok) {
      const apAccounts = await apResp.json();
      if (apAccounts.QueryResponse?.Account?.[0]?.Id) {
        return apAccounts.QueryResponse.Account[0].Id;
      }
    }

    throw new Error(
      "No Accrued Liabilities or Accounts Payable account found. Please create one in QBO."
    );
  } catch (error: any) {
    console.warn(`[accruals] Could not find liability account: ${error?.message}`);
    throw error;
  }
}

// Detect/recompute accrual candidates
routes.post("/accruals/detect", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    const from = String(req.body?.from || "");
    const to = String(req.body?.to || "");
    const debug = req.query.debug === "1" || req.body?.debug === true;

    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    console.log(`[accruals] Detecting candidates for org ${orgId}, period ${from} to ${to}${debug ? " (debug mode)" : ""}`);

    // Load rules for this org
    const rules = await getAccrualRules(orgId);

    // Run detection with rules
    const result = await detectAccrualCandidates(orgId, from, to, rules, debug);

    // Save to database
    await saveAccrualCandidates(orgId, from, to, result.candidates);

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      candidatesCount: result.candidates.length,
      candidates: result.candidates,
      debug: result.debug,
    });
  } catch (e: any) {
    console.error("POST /accruals/detect failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get accrual candidates for a period
routes.get("/accruals/candidates", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");

    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "Missing orgId/from/to" });
    }

    const candidates = await getAccrualCandidates(orgId, from, to);

    // Parse explanation JSON
    const candidatesWithExplanation = candidates.map((c) => ({
      ...c,
      explanation: JSON.parse(c.explanation_json || "{}"),
    }));

    return res.json({
      ok: true,
      orgId,
      from,
      to,
      candidates: candidatesWithExplanation,
    });
  } catch (e: any) {
    console.error("GET /accruals/candidates failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Approve or reject a candidate
routes.post("/accruals/:candidateId/approve", async (req, res) => {
  try {
    const candidateId = String(req.params.candidateId || "");
    const orgId = String(req.body?.orgId || "");
    const decision = String(req.body?.decision || "").toLowerCase();
    const approvedBy = String(req.body?.approvedBy || "");
    const notes = String(req.body?.notes || "");

    if (!candidateId || !orgId) {
      return res.status(400).json({ ok: false, error: "Missing candidateId/orgId" });
    }

    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ ok: false, error: "Decision must be 'approved' or 'rejected'" });
    }

    await approveAccrualCandidate(candidateId, orgId, decision, approvedBy || undefined, notes || undefined);

    return res.json({
      ok: true,
      candidateId,
      decision,
    });
  } catch (e: any) {
    console.error("POST /accruals/:candidateId/approve failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Push approved accrual to QBO
routes.post("/accruals/:candidateId/push", async (req, res) => {
  try {
    const candidateId = String(req.params.candidateId || "");
    const orgId = String(req.body?.orgId || "");
    const dryRun = req.query.dryRun === "1" || req.body?.dryRun === true;

    if (!candidateId || !orgId) {
      return res.status(400).json({ ok: false, error: "Missing candidateId/orgId" });
    }

    // Get candidate
    const candidate = await getAccrualCandidateById(candidateId, orgId);

    if (!candidate) {
      return res.status(404).json({ ok: false, error: "Candidate not found" });
    }

    if (candidate.status !== "approved") {
      return res.status(400).json({ ok: false, error: "Candidate must be approved before pushing" });
    }

    // Dry run: return the payload without posting
    if (dryRun) {
      const explanation = JSON.parse(candidate.explanation_json || "{}");
      const liabilityAccountId = await findOrCreateAccrualLiabilityAccount(orgId).catch(() => "ACCRUED_LIABILITIES_ACCOUNT_ID");
      
      const journalEntry = {
        TxnDate: candidate.period_to_date,
        PrivateNote: `Accrual: ${candidate.account_name}${candidate.vendor_name ? ` - ${candidate.vendor_name}` : ""}. ${explanation.reason || ""}`,
        Line: [
          {
            Id: "0",
            Description: `Accrual for ${candidate.account_name}`,
            Amount: candidate.expected_amount,
            DetailType: "JournalEntryLineDetail",
            JournalEntryLineDetail: {
              PostingType: "Debit",
              AccountRef: {
                value: candidate.account_id,
                name: candidate.account_name,
              },
            },
          },
          {
            Id: "1",
            Description: `Accrual liability for ${candidate.account_name}`,
            Amount: candidate.expected_amount,
            DetailType: "JournalEntryLineDetail",
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: {
                value: liabilityAccountId,
                name: "Accrued Liabilities",
              },
            },
          },
        ],
      };

      return res.json({
        ok: true,
        dryRun: true,
        candidateId,
        journalEntry,
        message: "Dry run - Journal Entry payload generated but not posted to QBO",
      });
    }

    const result = await pushAccrualToQbo(orgId, candidate);

    return res.json({
      ok: result.success,
      candidateId,
      journalEntryId: result.journalEntryId,
      error: result.error,
    });
  } catch (e: any) {
    console.error("POST /accruals/:candidateId/push failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get accrual history
routes.get("/accruals/history", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const limit = Number(req.query.limit || 50);

    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    const history = await getAccrualHistory(orgId, limit);

    // Parse explanation JSON
    const historyWithExplanation = history.map((item) => ({
      ...item,
      explanation: JSON.parse(item.explanation_json || "{}"),
    }));

    return res.json({
      ok: true,
      orgId,
      history: historyWithExplanation,
    });
  } catch (e: any) {
    console.error("GET /accruals/history failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get accrual rules for an org
routes.get("/accruals/rules", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    const rules = await getAccrualRules(orgId);
    return res.json({ ok: true, orgId, rules });
  } catch (e: any) {
    console.error("GET /accruals/rules failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Save accrual rules for an org
routes.post("/accruals/rules", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    const rules = await saveAccrualRules(orgId, {
      lookback_months: req.body?.lookback_months,
      min_amount: req.body?.min_amount,
      confidence_threshold: req.body?.confidence_threshold,
      min_recurrence_count: req.body?.min_recurrence_count,
      excluded_accounts: req.body?.excluded_accounts,
      excluded_vendors: req.body?.excluded_vendors,
      include_accounts: req.body?.include_accounts,
    });

    return res.json({ ok: true, orgId, rules });
  } catch (e: any) {
    console.error("POST /accruals/rules failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Reset accrual rules to defaults
routes.post("/accruals/rules/reset", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    const rules = await resetAccrualRulesToDefaults(orgId);
    return res.json({ ok: true, orgId, rules });
  } catch (e: any) {
    console.error("POST /accruals/rules/reset failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get diagnostics (data availability snapshot)
routes.get("/accruals/diagnostics", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    // Calculate last 6 months periods
    const now = new Date();
    const periods: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      periods.push({
        from: monthStart.toISOString().slice(0, 10),
        to: monthEnd.toISOString().slice(0, 10),
      });
    }

    // Fetch P&L for the most recent period to get account/vendor data
    const mostRecentPeriod = periods[0];
    let accountVendorData: Array<{ accountId: string; accountName: string; vendorName: string | null; amount: number }> = [];

    try {
      const pnl = await qboFetchForOrg(orgId, "/reports/ProfitAndLoss", {
        start_date: mostRecentPeriod.from,
        end_date: mostRecentPeriod.to,
      });

      // Extract expense accounts (simplified version)
      const expenses = extractExpenseAccountsForDiagnostics(pnl);
      accountVendorData = expenses
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 10)
        .map((e) => ({
          accountId: e.accountId,
          accountName: e.accountName,
          vendorName: e.vendorName,
          amount: e.amount,
        }));
    } catch (error: any) {
      console.warn(`[accruals] Could not fetch P&L for diagnostics: ${error?.message}`);
    }

    return res.json({
      ok: true,
      orgId,
      last_6_months_periods: periods,
      top_accounts_vendors: accountVendorData,
      summary: {
        periods_available: periods.length,
        accounts_found: accountVendorData.length,
        total_amount: accountVendorData.reduce((sum, a) => sum + Math.abs(a.amount), 0),
      },
    });
  } catch (e: any) {
    console.error("GET /accruals/diagnostics failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Helper function for diagnostics
function extractExpenseAccountsForDiagnostics(pnl: any): Array<{
  accountId: string;
  accountName: string;
  vendorName: string | null;
  amount: number;
}> {
  const expenses: Array<{
    accountId: string;
    accountName: string;
    vendorName: string | null;
    amount: number;
  }> = [];
  const accountMap = new Map<string, { accountId: string; accountName: string; vendorName: string | null; amount: number }>();

  function processRow(row: any, path: string[] = []) {
    if (!row) return;

    const cols = row.ColData || [];
    if (!Array.isArray(cols) || cols.length === 0) {
      if (row.Rows?.Row) {
        for (const child of row.Rows.Row) {
          processRow(child, path);
        }
      }
      return;
    }

    const accountName = cols[0]?.value || "";
    const accountId = cols[0]?.id;
    const amount = parseAmountForDiagnostics(cols[cols.length - 1]?.value);

    if (accountId && amount < 0 && Math.abs(amount) > 10) {
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountName: path.length > 0 ? path.join(" / ") + " / " + accountName : accountName,
          vendorName: extractVendorNameForDiagnostics(accountName),
          amount: 0,
        });
      }
      const acc = accountMap.get(accountId)!;
      acc.amount += Math.abs(amount);
    }

    if (row.Rows?.Row && Array.isArray(row.Rows.Row)) {
      const nextPath = accountName && accountName.trim() ? [...path, accountName] : path;
      for (const child of row.Rows.Row) {
        processRow(child, nextPath);
      }
    }
  }

  if (pnl?.Rows?.Row && Array.isArray(pnl.Rows.Row)) {
    for (const row of pnl.Rows.Row) {
      processRow(row);
    }
  }

  return Array.from(accountMap.values());
}

function parseAmountForDiagnostics(value: any): number {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  const negByParens = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negByParens ? -n : n;
}

function extractVendorNameForDiagnostics(accountName: string): string | null {
  const vendorPatterns = [
    /^(.+?)\s+(Services|Inc|LLC|Corp|Ltd|Company)/i,
    /^(.+?)\s+-\s+/,
  ];
  for (const pattern of vendorPatterns) {
    const match = accountName.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// ==================== Reconciliation Routes ====================

// Configure multer for file uploads (memory storage for MVP)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/recon/statements/upload
routes.post("/recon/statements/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const orgId = String(req.body.orgId || "");
    const kind = String(req.body.kind || "") as "bank" | "credit_card";
    const periodFrom = String(req.body.periodFrom || "");
    const periodTo = String(req.body.periodTo || "");
    const accountName = String(req.body.accountName || "").trim() || undefined;
    const accountLast4 = String(req.body.accountLast4 || "").trim() || undefined;

    if (!orgId || !kind || !periodFrom || !periodTo) {
      return res.status(400).json({ ok: false, error: "Missing required fields: orgId, kind, periodFrom, periodTo" });
    }

    if (kind !== "bank" && kind !== "credit_card") {
      return res.status(400).json({ ok: false, error: "kind must be 'bank' or 'credit_card'" });
    }

    // Parse CSV
    const csvContent = file.buffer.toString("utf-8");
    const parsedLines = parseCSV(csvContent, kind);

    if (parsedLines.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid lines found in CSV" });
    }

    // Create statement
    const { statementId } = await createStatement(
      orgId,
      kind,
      periodFrom,
      periodTo,
      file.originalname || "uploaded.csv",
      accountName,
      accountLast4
    );

    // Insert lines
    const { linesInserted } = await insertStatementLines(statementId, parsedLines);

    // Return sample lines (first 5)
    const sampleLines = parsedLines.slice(0, 5).map((l) => ({
      postedDate: l.postedDate,
      description: l.description,
      amount: l.amount,
      hasReceipt: l.hasReceipt,
    }));

    return res.json({
      ok: true,
      statementId,
      linesInserted,
      sampleLines,
    });
  } catch (e: any) {
    console.error("Upload error:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/recon/statements
routes.get("/recon/statements", async (req, res) => {
  try {
    const orgId = String(req.query.orgId || "");
    const kind = req.query.kind as "bank" | "credit_card" | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    const statements = await listStatements(orgId, kind, from, to);

    // Get line counts for each statement
    const statementsWithCounts = await Promise.all(
      statements.map(async (stmt) => {
        const lines = await listStatementLines(stmt.id);
        return {
          ...stmt,
          lineCount: lines.length,
        };
      })
    );

    return res.json({ ok: true, statements: statementsWithCounts });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/recon/lines
routes.get("/recon/lines", async (req, res) => {
  try {
    const statementId = req.query.statementId as string | undefined;
    const status = req.query.status as "unmatched" | "matched" | "ambiguous" | "ignored" | undefined;

    const lines = await listStatementLines(statementId, status);

    return res.json({ ok: true, lines });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/recon/match/run
routes.post("/recon/match/run", async (req, res) => {
  try {
    const orgId = String(req.body.orgId || "");
    const kind = String(req.body.kind || "") as "bank" | "credit_card";
    const periodFrom = String(req.body.periodFrom || "");
    const periodTo = String(req.body.periodTo || "");
    const statementId = req.body.statementId as string | undefined;

    if (!orgId || !kind || !periodFrom || !periodTo) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // Get statement lines to match
    const lines = await listStatementLines(statementId, "unmatched");

    if (lines.length === 0) {
      return res.json({ ok: true, matchedCount: 0, ambiguousCount: 0, unmatchedCount: 0 });
    }

    // Fetch QBO transactions for the period
    // For MVP, we'll fetch from the TransactionList report
    // In a real implementation, we'd fetch from specific accounts (bank/CC accounts)
    const qboTransactions = await fetchQboTransactionsForPeriod(orgId, periodFrom, periodTo);

    // Match lines to QBO transactions
    let matchedCount = 0;
    let ambiguousCount = 0;

    for (const line of lines) {
      const matches = findMatches(line, qboTransactions);

      if (matches.length === 1 && matches[0].score >= 0.8) {
        // High confidence single match
        await updateLineMatchStatus(line.id, "matched", matches[0].qboTxnId, matches[0].score);
        matchedCount++;
      } else if (matches.length > 1 && matches[0].score >= 0.7) {
        // Multiple candidates, mark as ambiguous
        await updateLineMatchStatus(line.id, "ambiguous", undefined, matches[0].score);
        ambiguousCount++;
      }
      // Otherwise, leave as unmatched
    }

    const unmatchedCount = lines.length - matchedCount - ambiguousCount;

    return res.json({
      ok: true,
      matchedCount,
      ambiguousCount,
      unmatchedCount,
    });
  } catch (e: any) {
    console.error("Match error:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/recon/lines/:id/ignore
routes.post("/recon/lines/:id/ignore", async (req, res) => {
  try {
    const lineId = String(req.params.id);

    await updateLineMatchStatus(lineId, "ignored");

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/recon/lines/:id/attach-receipt
routes.post("/recon/lines/:id/attach-receipt", async (req, res) => {
  try {
    const lineId = String(req.params.id);
    const hasReceipt = Boolean(req.body.hasReceipt);
    const receiptUrl = req.body.receiptUrl as string | undefined;

    await updateLineReceipt(lineId, hasReceipt, receiptUrl);

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Helper: Fetch QBO transactions for matching
async function fetchQboTransactionsForPeriod(orgId: string, from: string, to: string): Promise<any[]> {
  try {
    // Fetch TransactionList report (simplified for MVP)
    const report = await qboFetchForOrg(orgId, "/reports/TransactionList", {
      start_date: from,
      end_date: to,
      minorversion: "65",
    });

    // Extract transactions from report structure
    const transactions: any[] = [];
    if (report?.Rows?.Row) {
      for (const row of report.Rows.Row) {
        if (row.ColData && row.ColData.length >= 3) {
          transactions.push({
            date: row.ColData[0]?.value,
            description: row.ColData[1]?.value || "",
            amount: parseQboAmount(row.ColData[2]?.value),
            id: row.id || crypto.randomUUID(),
          });
        }
      }
    }

    return transactions;
  } catch (e: any) {
    console.warn("Failed to fetch QBO transactions:", e?.message);
    return [];
  }
}

function parseQboAmount(value: any): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const negByParens = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? (negByParens ? -n : n) : null;
}

// Helper: Find matching QBO transactions for a statement line
function findMatches(
  line: { posted_date: string; amount: number; description: string },
  qboTransactions: any[]
): Array<{ qboTxnId: string; score: number }> {
  const matches: Array<{ qboTxnId: string; score: number }> = [];

  const lineDate = new Date(line.posted_date);
  const lineAmount = Math.abs(line.amount);
  const lineDesc = normalizeDescription(line.description);

  for (const txn of qboTransactions) {
    if (!txn.date || !txn.amount) continue;

    const txnDate = new Date(txn.date);
    const txnAmount = Math.abs(txn.amount);
    const txnDesc = normalizeDescription(txn.description || "");

    let score = 0;

    // Amount match (exact = 0.5, within 1% = 0.4)
    if (Math.abs(lineAmount - txnAmount) < 0.01) {
      score += 0.5;
    } else if (Math.abs(lineAmount - txnAmount) / lineAmount < 0.01) {
      score += 0.4;
    } else {
      continue; // Amount must match reasonably
    }

    // Date match (within 3 days = 0.3, exact = 0.4)
    const daysDiff = Math.abs((lineDate.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff === 0) {
      score += 0.4;
    } else if (daysDiff <= 3) {
      score += 0.3;
    } else {
      continue; // Date must be within 3 days
    }

    // Description similarity (simple contains check = 0.1)
    if (lineDesc && txnDesc && (lineDesc.includes(txnDesc) || txnDesc.includes(lineDesc))) {
      score += 0.1;
    }

    if (score >= 0.7) {
      matches.push({ qboTxnId: txn.id, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
