// api/src/env.ts

function req(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function opt(name: string, fallback = "") {
  return process.env[name] || fallback;
}

const QBO_ENV = (opt("QBO_ENV", "sandbox") as "sandbox" | "production");

export const ENV = {
  // Server
  PORT: Number(opt("PORT", "8081")), // Changed default to 8081 for dashboard version
  HOST: opt("HOST", "0.0.0.0"),

  // Database
  DATABASE_URL: req("DATABASE_URL"),

  // App URLs - Must be set in production (no localhost fallback)
  APP_BASE_URL: opt("APP_BASE_URL", ""),
  WEB_BASE_URL: opt("WEB_BASE_URL", opt("APP_BASE_URL", "")),

  // QBO
  QBO_ENV,
  QBO_CLIENT_ID: req("QBO_CLIENT_ID"),
  QBO_CLIENT_SECRET: req("QBO_CLIENT_SECRET"),
  // MUST be set and MUST match Intuit Developer Portal Redirect URIs exactly
  QBO_REDIRECT_URI: req("QBO_REDIRECT_URI"),

  // Prefer explicit base URL; otherwise infer from env
  QBO_BASE_URL:
    opt(
      "QBO_BASE_URL",
      QBO_ENV === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com"
    ),
} as const;
