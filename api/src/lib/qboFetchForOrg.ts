// api/src/lib/qboFetchForOrg.ts
import { q } from "../db.js";
import { ENV } from "../env.js";
import { refreshAccessToken } from "../qboAuth.js";

type QboConn = {
  id: string;
  org_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
};

function isExpired(iso: string) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Date.now() >= t - 60_000 : true; // refresh 60s early
}

async function getQboConnection(orgId: string): Promise<QboConn | null> {
  const rows = await q<QboConn>(`select * from qbo_connections where org_id = $1`, [orgId]);
  return rows[0] || null;
}

export async function getValidQboConnection(orgId: string): Promise<QboConn> {
  const c = await getQboConnection(orgId);
  if (!c) throw new Error("No QBO connection found for this org");

  if (!isExpired(c.expires_at)) return c;

  // refresh token flow
  const refreshed = await refreshAccessToken(c.refresh_token);

  const newExpiresAtIso = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  const newRefreshToken = refreshed.refresh_token || c.refresh_token;
  const newRefreshExpiresAtIso = new Date(
    Date.now() + (refreshed.x_refresh_token_expires_in ?? 60 * 24 * 3600) * 1000
  ).toISOString();

  await q(
    `
    update qbo_connections
    set access_token = $1,
        refresh_token = $2,
        expires_at = $3,
        refresh_expires_at = $4,
        updated_at = now()
    where id = $5
    `,
    [refreshed.access_token, newRefreshToken, newExpiresAtIso, newRefreshExpiresAtIso, c.id]
  );

  const rows2 = await q<QboConn>(`select * from qbo_connections where id = $1`, [c.id]);
  const c2 = rows2[0];
  if (!c2) throw new Error("Failed to refresh QBO connection record");
  return c2;
}

export function qboApiBase(realmId: string) {
  const host =
    (ENV as any).QBO_BASE_URL ??
    (ENV.QBO_ENV === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com");

  return `${host}/v3/company/${realmId}`;
}

export type QboQuery = Record<string, string | number | boolean | undefined>;

/**
 * Fetch QBO JSON using orgId + relative path (e.g., "/reports/ProfitAndLoss")
 * and query parameters (e.g., { start_date, end_date, minorversion }).
 */
export async function qboFetchForOrg(
  orgId: string,
  path: string,
  query: QboQuery = {},
  init: RequestInit = {}
) {
  const conn = await getValidQboConnection(orgId);

  const base = qboApiBase(conn.realm_id);
  const url = new URL(`${base}${path}`);

  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${conn.access_token}`,
    Accept: "application/json",
    ...(init.headers as any),
  };

  const method = init.method || "GET";
  const body = init.body;
  
  const resp = await fetch(url.toString(), { ...init, method, headers, body });
  const text = await resp.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json is fine for error fallback
  }

  if (!resp.ok) {
    const msg =
      json?.Fault?.Error?.[0]?.Message ||
      json?.message ||
      `QBO request failed (${resp.status})`;
    throw new Error(msg);
  }

  return json;
}
