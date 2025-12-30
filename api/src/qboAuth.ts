// api/src/qboAuth.ts
import crypto from "crypto";
import { ENV } from "./env.js";
import { q } from "./db.js";

// Credential fingerprint function (no secrets exposed)
function logCredentialFingerprint(context: string) {
  const clientId = ENV.QBO_CLIENT_ID || "";
  const clientSecret = ENV.QBO_CLIENT_SECRET || "";
  const qboEnv = ENV.QBO_ENV || "";
  const redirectUri = ENV.QBO_REDIRECT_URI || "";
  
  const clientIdLast4 = clientId.length >= 4 ? clientId.slice(-4) : "N/A";
  const clientSecretLast2 = clientSecret.length >= 2 ? clientSecret.slice(-2) : "N/A";
  
  // Hash of "client_id:client_secret" for fingerprinting
  const fingerprintInput = `${clientId}:${clientSecret}`;
  const fingerprintHash = crypto.createHash("sha256").update(fingerprintInput).digest("hex").slice(0, 8);
  
  console.log(`[credential-fingerprint:${context}]`);
  console.log(`  QBO_ENV: ${qboEnv}`);
  console.log(`  QBO_REDIRECT_URI: ${redirectUri}`);
  console.log(`  QBO_CLIENT_ID: length=${clientId.length}, last4=${clientIdLast4}`);
  console.log(`  QBO_CLIENT_SECRET: length=${clientSecret.length}, last2=${clientSecretLast2}`);
  console.log(`  Fingerprint (sha256 first 8): ${fingerprintHash}`);
}

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
  // Log the full URL with redirect_uri visible (safe, no secrets)
  const sanitizedUrl = fullUrl.replace(/client_id=[^&]+/, "client_id=***");
  console.log("[qboAuth] Generated authorize URL (sanitized):", sanitizedUrl);
  console.log("[qboAuth] redirect_uri in URL:", redirectUriValue);
  console.log("[qboAuth] redirect_uri encoded check:", params.get("redirect_uri"));

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
  
  // Log credential fingerprint before token exchange
  logCredentialFingerprint("token-exchange");

  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  
  // Deterministic Basic auth header construction with diagnostics
  const cid = (ENV.QBO_CLIENT_ID || "").trim();
  const csec = (ENV.QBO_CLIENT_SECRET || "").trim();
  const basicRaw = `${cid}:${csec}`;
  const basicB64 = Buffer.from(basicRaw, "utf8").toString("base64");
  const authHeader = `Basic ${basicB64}`;
  
  // Decode sanity check
  const decoded = Buffer.from(basicB64, "base64").toString("utf8");
  const decodedParts = decoded.split(":");
  const decodedCid = decodedParts[0] || "";
  const decodedCsec = decodedParts.slice(1).join(":") || "";

  // Comprehensive diagnostics (NO secrets)
  console.log("[qboAuth:token-exchange] Basic Auth Diagnostics:");
  console.log("  cid length:", cid.length, "last4:", cid.length >= 4 ? cid.slice(-4) : "N/A");
  console.log("  csec length:", csec.length, "last2:", csec.length >= 2 ? csec.slice(-2) : "N/A");
  console.log("  cid === cid.trim():", ENV.QBO_CLIENT_ID === cid);
  console.log("  csec === csec.trim():", ENV.QBO_CLIENT_SECRET === csec);
  console.log("  basicRaw length:", basicRaw.length);
  console.log("  basicB64 length:", basicB64.length);
  console.log("  authHeader prefix (first 10 chars):", authHeader.substring(0, 10));
  console.log("  Decoded sanity check:");
  console.log("    decoded contains ':':", decoded.includes(":"));
  console.log("    decoded prefix (cid) last4:", decodedCid.length >= 4 ? decodedCid.slice(-4) : "N/A");
  console.log("    decoded suffix (csec) length:", decodedCsec.length, "last2:", decodedCsec.length >= 2 ? decodedCsec.slice(-2) : "N/A");
  console.log("    decoded cid matches env cid:", decodedCid === cid);
  console.log("    decoded csec matches env csec:", decodedCsec === csec);

  const bodyParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriValue,
  });
  
  // Convert to string for form-urlencoded body
  const bodyString = bodyParams.toString();

  // Safe debug logs (no secrets)
  console.log("[qboAuth:token-exchange] Request details:");
  console.log("  token URL:", tokenUrl);
  console.log("  method: POST");
  console.log("  Content-Type: application/x-www-form-urlencoded");
  console.log("  Accept: application/json");
  console.log("  Authorization header present:", !!authHeader);
  console.log("  Authorization scheme: Basic");
  console.log("  Body keys:", Array.from(bodyParams.keys()).join(", "));
  console.log("  grant_type:", bodyParams.get("grant_type"));
  console.log("  code length:", code.length);
  console.log("  redirect_uri:", redirectUriValue);
  console.log("  redirect_uri length:", redirectUriValue.length);
  console.log("  Body string (sanitized):", bodyString.replace(/code=[^&]+/, "code=***"));

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyString,
  });

  // Log response details
  const responseText = await resp.text().catch(() => "");
  const responsePreview = responseText.substring(0, 200);
  console.log("[qboAuth:token-exchange] Response:");
  console.log("  status:", resp.status, resp.statusText);
  console.log("  response preview (first 200 chars):", responsePreview);

  let json: any = {};
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch (e) {
    console.error("[qboAuth:token-exchange] Failed to parse JSON response:", e);
    json = {};
  }

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
