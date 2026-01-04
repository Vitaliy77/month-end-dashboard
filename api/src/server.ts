// api/src/server.ts

// CRITICAL: Load environment variables FIRST, before any other imports
import "./load-env.js";

import crypto from "crypto";

// Log environment variables at startup (safe, no secrets)
console.log("[env] PORT=", process.env.PORT);
console.log("[env] QBO_REDIRECT_URI=", process.env.QBO_REDIRECT_URI);
console.log("[env] QBO_ENV=", process.env.QBO_ENV);
console.log("[env] QBO_CLIENT_ID=", process.env.QBO_CLIENT_ID ? "***SET***" : "MISSING");
console.log("[env] APP_BASE_URL=", process.env.APP_BASE_URL);
console.log("[env] WEB_BASE_URL=", process.env.WEB_BASE_URL);

// Credential fingerprint function (no secrets exposed)
function logCredentialFingerprint(context: string) {
  const clientId = process.env.QBO_CLIENT_ID || "";
  const clientSecret = process.env.QBO_CLIENT_SECRET || "";
  const qboEnv = process.env.QBO_ENV || "";
  const redirectUri = process.env.QBO_REDIRECT_URI || "";
  
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

// Log credential fingerprint at startup
logCredentialFingerprint("startup");

import express from "express";
import cors from "cors";
import { ENV } from "./env.js";
import { routes } from "./routes.js";
import { initSchema } from "./db/schema.js";




process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const app = express();

// Trust reverse proxies (DigitalOcean / load balancers)
app.set("trust proxy", 1);

// Body parsing
app.use(express.json({ limit: "2mb" }));

// Basic request logging (useful in DO logs)
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Health check
app.get("/api/health", (req, res) => {
  console.log("[HEALTH_HIT]", { pid: process.pid, cwd: process.cwd() });
  res.status(200).json({
    ok: true,
    service: "month-end-dashboard-api",
    buildStamp: "api-2026-01-04-B",
    pid: process.pid,
    cwd: process.cwd(),
  });
});

// Mount all API routes under /api
app.use("/api", routes);

// Initialize database schema in background (don't block server startup)
initSchema().catch((err) => {
  console.error("Failed to initialize database schema:", err);
  // Don't exit - let server continue running
});

// Server startup - always bind, unconditional
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  console.log("API listening on", { host, port });
});
