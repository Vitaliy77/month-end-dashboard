// api/src/monthend/monthend.ts (or wherever it's located)

import { Router } from "express";
import crypto from "node:crypto";

import { extractPnlLines, findNetIncome } from "../qbo/pnlParse.js";
import { buildFindingsFromPnl } from "../monthend/checksPnl.js";
import { getProfitAndLossReport } from "../qbo/reports.js";

function priorMonthRange(from: string, to: string) {
  // simple: take "from" month and subtract 1 month, keep same day patterns
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, f.getUTCDate()));
  const pt = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, t.getUTCDate()));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(pf), to: fmt(pt) };
}

const r = Router();

r.post("/run", async (req, res) => {
  try {
    const { orgId, from, to } = req.body ?? {};
    if (!orgId || !from || !to) {
      return res.status(400).json({ ok: false, error: "orgId, from, to are required" });
    }

    const prev = priorMonthRange(from, to);

    const [pnlThis, pnlPrev] = await Promise.all([
      getProfitAndLossReport(orgId, from, to),
      getProfitAndLossReport(orgId, prev.from, prev.to),
    ]);

    const pnlLines = extractPnlLines(pnlThis);
    const pnlLinesPrev = extractPnlLines(pnlPrev);

    const netIncomeThis = findNetIncome(pnlThis);
    const netIncomePrev = findNetIncome(pnlPrev);

    const findings = buildFindingsFromPnl({
      orgId,
      from,
      to,
      pnlLines,
      netIncomeThis,
      netIncomePrev,
      pnlLinesPrev,
    });

    const runId = crypto.randomUUID();

    return res.json({
      ok: true,
      runId,
      orgId,
      from,
      to,
      prev,
      findings,
      summary: {
        findingsCount: findings.length,
        warnCount: findings.filter((f) => f.severity === "warn").length,
        criticalCount: findings.filter((f) => f.severity === "critical").length,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Unknown error" });
  }
});

export default r;