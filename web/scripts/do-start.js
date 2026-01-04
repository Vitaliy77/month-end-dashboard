#!/usr/bin/env node
const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";

// Prefer local next binary (node_modules/.bin) so "next not found" never happens
const nextBin = process.platform === "win32"
  ? join(process.cwd(), "node_modules", ".bin", "next.cmd")
  : join(process.cwd(), "node_modules", ".bin", "next");

// Fallback to global next if local doesn't exist (shouldn't happen in production)
const cmd = existsSync(nextBin) ? nextBin : "next";

const args = ["start", "-p", port, "-H", host];

console.log(`[do-start] Starting Next.js on ${host}:${port}`);
console.log(`[do-start] Using: ${cmd}`);

const res = spawnSync(cmd, args, { stdio: "inherit" });
process.exit(res.status ?? 1);

