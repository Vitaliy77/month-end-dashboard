// api/src/qbo/reports.ts
import { qboFetchForOrg } from "../lib/qboFetchForOrg.js";

export async function getProfitAndLossReport(orgId: string, from: string, to: string) {
  return qboFetchForOrg(orgId, "/reports/ProfitAndLoss", {
    start_date: from,
    end_date: to,
    minorversion: "65",
  });
}

export async function getTrialBalanceReport(orgId: string, from: string, to: string) {
  return qboFetchForOrg(orgId, "/reports/TrialBalance", {
    start_date: from,
    end_date: to,
    minorversion: "65",
  });
}

export async function getBalanceSheetReport(orgId: string, from: string, to: string) {
  return qboFetchForOrg(orgId, "/reports/BalanceSheet", {
    start_date: from,
    end_date: to,
    minorversion: "65",
  });
}

export async function getCashFlowReport(orgId: string, from: string, to: string) {
  return qboFetchForOrg(orgId, "/reports/CashFlow", {
    start_date: from,
    end_date: to,
    minorversion: "65",
  });
}
