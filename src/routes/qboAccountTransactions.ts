// api/src/routes/qboAccountTransactions.ts
import type { Request, Response } from "express";
import { qboFetchForOrg } from "../lib/qboFetchForOrg.js";

export async function qboAccountTransactions(req: Request, res: Response) {
  try {
    const orgId = String(req.query.orgId ?? "");
    const accountId = String(req.query.accountId ?? "");
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");

    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });
    if (!accountId) return res.status(400).json({ ok: false, error: "Missing accountId" });
    if (!from || !to) return res.status(400).json({ ok: false, error: "Missing from/to" });

    const reportName = "TransactionListByAccount";

    const report = await qboFetchForOrg(orgId, `/reports/${reportName}`, {
      start_date: from,
      end_date: to,
      summarize_column_by: "Total",
      account: accountId,
      accounts: accountId,
      minorversion: "65",
    });

    return res.json({
      ok: true,
      orgId,
      accountId,
      from,
      to,
      reportName,
      report,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
