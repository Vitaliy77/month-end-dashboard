// web/src/components/ReportHeader.tsx
// Shared header component for all report pages (TB, BS, P&L, CF)

import { type ReactNode } from "react";
import { ui } from "./ui";

type ReportHeaderProps = {
  title: string; // "TB" / "BS" / "P&L" / "CF"
  orgLine: string; // "orgId • Org Name • Period: from → to"
  controls?: ReactNode; // Buttons, toggles, search inputs
  statusText: string; // "TB loaded ✅ (46 account(s))"
  debugText?: string; // "Debug: rawRows=47 • accounts=46 • filtered=46 • First: Checking, Savings, A/R"
};

export function ReportHeader({ title, orgLine, controls, statusText, debugText }: ReportHeaderProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-4">
      {/* Row A: Title + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-semibold tracking-tight text-slate-900">{title} Report</div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>

      {/* Row B: Org/Period line (small) */}
      <div className="mt-2 text-xs text-slate-600">{orgLine}</div>

      {/* Row C: Status + Debug (merged, compact) */}
      <div className="mt-2 text-xs text-slate-600">
        {statusText}
        {process.env.NODE_ENV !== "production" && debugText && (
          <span className="ml-2">• {debugText}</span>
        )}
      </div>
    </div>
  );
}

