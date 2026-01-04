"use client";

import { useState } from "react";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { TrialBalanceView } from "@/components/reports/TrialBalanceView";
import { BalanceSheetView } from "@/components/reports/BalanceSheetView";
import { PnlView } from "@/components/reports/PnlView";
import { CashFlowView } from "@/components/reports/CashFlowView";

type ReportTab = "tb" | "bs" | "pnl" | "cf";

export default function ReportsPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [reportTab, setReportTab] = useState<ReportTab>("tb");

  const orgLine = orgId && orgName ? `${orgId} • ${orgName}` : orgId || "No org selected";
  const periodLine = from && to ? `Period: ${from} → ${to}` : "No period selected";

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-2">Reports</h1>
          <div className="text-sm text-slate-600">
            {orgLine} • {periodLine}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-4">
            <button
              onClick={() => setReportTab("tb")}
              className={`px-4 py-2 font-medium ${
                reportTab === "tb"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Trial Balance
            </button>
            <button
              onClick={() => setReportTab("bs")}
              className={`px-4 py-2 font-medium ${
                reportTab === "bs"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Balance Sheet
            </button>
            <button
              onClick={() => setReportTab("pnl")}
              className={`px-4 py-2 font-medium ${
                reportTab === "pnl"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              P&L
            </button>
            <button
              onClick={() => setReportTab("cf")}
              className={`px-4 py-2 font-medium ${
                reportTab === "cf"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cash Flow
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {reportTab === "tb" && <TrialBalanceView compact />}
          {reportTab === "bs" && <BalanceSheetView compact />}
          {reportTab === "pnl" && <PnlView compact />}
          {reportTab === "cf" && <CashFlowView compact />}
        </div>
      </div>
    </div>
  );
}

