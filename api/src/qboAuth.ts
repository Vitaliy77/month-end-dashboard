// api/src/qboAuth.ts
import crypto from "crypto";
import { ENV } from "./env.js";
import { q } from "./db.js";

function redirectUri() {
  // QBO_REDIRECT_URI is required and must be set via environment variable
  // It must match exactly what's configured in Intuit Developer Portal
  if (!ENV.QBO_REDIRECT_URI) {
    throw new Error("QBO_REDIRECT_URI must be set in environment variables");
  }
  return ENV.QBO_REDIRECT_URI;
}



/**
 * Builds the QuickBooks OAuth2 authorization URL and stores the state in the DB
 * for secure callback handling.
 */
export async function buildAuthUrl(orgId: string) {
  if (!orgId) throw new Error("Missing orgId");
  if (!ENV.QBO_CLIENT_ID) throw new Error("Missing QBO_CLIENT_ID");

  const redirectUriValue = redirectUri();
  
  // Log the redirect_uri being used (safe to log, no secrets)
  console.log("[qboAuth] Building auth URL for orgId:", orgId);
  console.log("[qboAuth] Using redirect_uri:", redirectUriValue);
  console.log("[qboAuth] QBO_ENV:", ENV.QBO_ENV);
  console.log("[qboAuth] Client ID:", ENV.QBO_CLIENT_ID ? "***SET***" : "MISSING");

  const state = crypto.randomBytes(16).toString("hex");

  // Store mapping so callback can recover orgId (one-time use)
  await q(
    `insert into oauth_states(state, org_id, created_at)
     values($1,$2, now())`,
    [state, orgId]
  );

  const base = "https://appcenter.intuit.com/connect/oauth2";
  const params = new URLSearchParams({
    client_id: ENV.QBO_CLIENT_ID,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUriValue,
    state,
  });

  const fullUrl = `${base}?${params.toString()}`;
  console.log("[qboAuth] Generated authorize URL (sanitized):", 
    fullUrl.replace(/client_id=[^&]+/, "client_id=***"));

  return { url: fullUrl, state };
}

/**
 * Exchanges the authorization code for access/refresh tokens.
 * NOTE: Intuit requires the SAME redirect_uri used in the initial auth request.
 */
export async function exchangeCodeForTokens(code: string) {
  if (!code) throw new Error("Missing code");
  if (!ENV.QBO_CLIENT_ID || !ENV.QBO_CLIENT_SECRET) {
    throw new Error("Missing QBO client credentials");
  }

  const redirectUriValue = redirectUri();
  console.log("[qboAuth] Exchanging code for tokens");
  console.log("[qboAuth] Using redirect_uri:", redirectUriValue);

  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const basic = Buffer.from(`${ENV.QBO_CLIENT_ID}:${ENV.QBO_CLIENT_SECRET}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriValue,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Log error details (sanitized)
    const errorDetails = {
      status: resp.status,
      statusText: resp.statusText,
      error: json.error || "unknown",
      error_description: json.error_description || "no description",
    };
    console.error("[qboAuth] Token exchange failed:", JSON.stringify(errorDetails));
    throw new Error(
      `QBO token exchange failed (${resp.status}): ${JSON.stringify(errorDetails)}`
    );
  }

  console.log("[qboAuth] Token exchange successful");
  return json as {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    token_type: string;
    x_refresh_token_expires_in: number; // seconds
  };
}

/**
 * Refreshes an expired access token using a refresh token.
 */
export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) throw new Error("Missing refreshToken");
  if (!ENV.QBO_CLIENT_ID || !ENV.QBO_CLIENT_SECRET) {
    throw new Error("Missing QBO client credentials");
  }

  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const basic = Buffer.from(`${ENV.QBO_CLIENT_ID}:${ENV.QBO_CLIENT_SECRET}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(`QBO refresh failed (${resp.status}): ${JSON.stringify(json)}`);
  }

  return json as {
    access_token: string;
    refresh_token?: string; // sometimes returned; if missing, keep old
    expires_in: number;
    token_type: string;
    x_refresh_token_expires_in?: number;
  };
}
