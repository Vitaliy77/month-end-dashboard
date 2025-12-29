// api/src/server.ts

import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

// Log environment variables at startup (safe, no secrets)
console.log("[env] PORT=", process.env.PORT);
console.log("[env] QBO_REDIRECT_URI=", process.env.QBO_REDIRECT_URI);
console.log("[env] QBO_ENV=", process.env.QBO_ENV);
console.log("[env] QBO_CLIENT_ID=", process.env.QBO_CLIENT_ID ? "***SET***" : "MISSING");
console.log("[env] APP_BASE_URL=", process.env.APP_BASE_URL);
console.log("[env] WEB_BASE_URL=", process.env.WEB_BASE_URL);

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
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "month-end-dashboard-api" });
});

// Mount all API routes under /api
app.use("/api", routes);

// Initialize database schema on startup
initSchema().catch((err) => {
  console.error("Failed to initialize database schema:", err);
  process.exit(1);
});

// Bind host:
// - Local dev: 127.0.0.1 works
// - Deployments: use 0.0.0.0 so the platform can route traffic
const host = (process.env.HOST || (ENV as any).HOST || "0.0.0.0") as string;

console.log("Starting API with ENV.PORT =", ENV.PORT, "host =", host);

app.listen(ENV.PORT, host, () => {
  console.log(`API listening on http://${host}:${ENV.PORT}`);
});
