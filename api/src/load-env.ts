// load-env.ts - Load environment variables BEFORE any other imports
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Determine env file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPathFromSrc = join(__dirname, "..", ".env");
const envPathFromCwd = join(process.cwd(), ".env");

// Try loading from relative to source file first, then from cwd
let envResult = dotenv.config({ path: envPathFromSrc });
let loadedFrom = envPathFromSrc;
if (envResult.error) {
  // Fallback to cwd-based path
  envResult = dotenv.config({ path: envPathFromCwd });
  loadedFrom = envPathFromCwd;
}

// Log environment loading diagnostics
console.log("[env] process.cwd() =", process.cwd());
console.log("[env] NODE_ENV =", process.env.NODE_ENV || "(not set)");
if (envResult.error) {
  console.log("[env] Tried loading from:", envPathFromSrc);
  console.log("[env] Fallback to:", envPathFromCwd);
  console.log("[env] dotenv.config result: ERROR:", envResult.error.message);
} else {
  console.log("[env] Loaded .env from:", loadedFrom);
  console.log("[env] dotenv.config result: SUCCESS");
}

// Verify critical env vars are loaded
if (!process.env.DATABASE_URL) {
  console.error("[env] ERROR: DATABASE_URL is not set after loading .env");
  console.error("[env] Make sure api/.env exists and contains DATABASE_URL");
  process.exit(1);
}

