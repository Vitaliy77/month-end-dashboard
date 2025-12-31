"use client";

import { useEffect, useMemo, useState } from "react";

import { ui } from "@/components/ui";
import { loadPnl, loadPnlSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { flattenQboRows } from "@/lib/qboFlatten";
import { buildStatementTree, flattenStatementTree, type StatementRow } from "@/lib/statementTree";
import { StatementTable } from "@/components/StatementTable";
import { ReportHeader } from "@/components/ReportHeader";

type Col = { ColTitle?: string; ColType?: string; MetaData?: any[] };
type ColData = { value?: string; id?: string };
type RowNode = {
  type?: string;
  group?: string;
  ColData?: ColData[];
  Header?: { ColData?: ColData[] };
  Summary?: { ColData?: ColData[] };
  Rows?: { Row?: RowNode[] };
};

function money(v?: string) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  const n = Number(s.replace(/,/g, ""));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PnlPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [useSeries, setUseSeries] = useState(false);

  const pnl = raw?.pnl;

  const columns: string[] = useMemo(() => {
    const cols: Col[] = pnl?.Columns?.Column || [];
    if (!Array.isArray(cols) || cols.length === 0) return ["Account", "Total"];
    return cols.map((c, i) => c?.ColTitle || (i === 0 ? "Account" : ""));
  }, [pnl]);

  const rows: RowNode[] = useMemo(() => {
    const top = pnl?.Rows?.Row || [];
    return Array.isArray(top) ? top : [];
  }, [pnl]);

  // Flatten QBO rows to extract paths and values (for single-month view)
  const flatRows = useMemo(() => {
    if (!pnl || rows.length === 0) return [];
    return flattenQboRows(rows, columns.slice(1)); // Skip first column (Account)
  }, [pnl, rows, columns]);

  // Convert FlatRow to StatementRow format (for single-month view)
  const statementRowsFromPnl: StatementRow[] = useMemo(() => {
    return flatRows.map((row) => ({
      account_id: row.accountId,
      account_path: row.path,
      account_name: row.label,
      ...row.values, // Spread all column values
    }));
  }, [flatRows]);

  // Convert SeriesRow to StatementRow format (for multi-month view)
  const statementRowsFromSeries: StatementRow[] = useMemo(() => {
    if (!seriesData || !seriesData.rows) return [];
    return seriesData.rows.map((row) => {
      // SeriesRow.account_name is the full path like "INCOME / Sales / Product Sales"
      const fullPath = row.account_name || "";
      // Extract leaf name (last segment after ' / ')
      const pathSegments = fullPath.split(" / ").filter(Boolean);
      const leafName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : fullPath;
      
      // Build StatementRow with proper mapping
      const statementRow: StatementRow = {
        account_id: row.account_id || undefined,
        account_path: fullPath, // Full path for tree building
        account_name: leafName, // Only leaf segment for display
        ...row.values, // Spread all column values (start, 2025-09, 2025-10, ..., end)
      };
      
      return statementRow;
    });
  }, [seriesData]);

  // Use series data if available and enabled, otherwise use P&L data
  const statementRows: StatementRow[] = useMemo(() => {
    if (useSeries && seriesData) {
      return statementRowsFromSeries;
    }
    return statementRowsFromPnl;
  }, [useSeries, seriesData, statementRowsFromSeries, statementRowsFromPnl]);

  // Build statement tree with proper grouping (works for both single-month and series views)
  const statementTree = useMemo(() => {
    if (statementRows.length === 0) return null;
    
    // For series view, use series columns; for single-month, use P&L columns
    const columnKeys = useSeries && seriesData 
      ? seriesData.columns // ["start", "2025-09", "2025-10", ..., "end"]
      : columns.slice(1); // Skip first column (Account)
    
    const tree = buildStatementTree(statementRows, {
      pathAccessor: (row) => row.account_path || row.account_name || "",
      accountIdAccessor: (row) => row.account_id,
      columnKeys,
    });
    
    return tree;
  }, [statementRows, columns, useSeries, seriesData]);

  // Flatten tree for display (includes subtotals) - works for both single-month and series views
  const displayRows = useMemo(() => {
    if (!statementTree) return [];
    
    // Get column keys for computed rows
    const columnKeys = useSeries && seriesData 
      ? seriesData.columns // ["start", "2025-09", "2025-10", ..., "end"]
      : columns.slice(1); // Skip first column (Account)
    
    const flattened = flattenStatementTree(statementTree, {
      includeSubtotals: true,
      includeStatementTotals: false, // P&L computes its own totals
      indentPerLevel: 16,
      statementType: "pnl",
      columnKeys,
    });
    
    return flattened;
  }, [statementTree, useSeries, seriesData, columns]);

  // Column model: for series view, we need both key (for value lookup) and label (for display)
  type ColumnModel = { key: string; label: string };
  
  const displayColumns: ColumnModel[] = useMemo(() => {
    if (useSeries && seriesData) {
      // Series view: map raw keys to display labels
      return [
        { key: "account", label: "Account" }, // First column is always Account
        ...seriesData.columns.map(col => {
          if (col === "start") return { key: "start", label: "Start" };
          if (col === "end") return { key: "end", label: "End" };
          // Format month: "2025-09" -> "Sep 2025"
          const [year, month] = col.split("-");
          const monthNum = parseInt(month, 10);
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return { key: col, label: `${monthNames[monthNum - 1]} ${year}` };
        })
      ];
    }
    // Single-month view: use column titles as both key and label
    return columns.map((col, idx) => ({
      key: idx === 0 ? "account" : col || `col${idx}`,
      label: col || (idx === 0 ? "Account" : ""),
    }));
  }, [useSeries, seriesData, columns]);

  // Check if range spans multiple months
  const spansMultipleMonths = useMemo(() => {
    if (!from || !to) return false;
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const fromMonth = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const toMonth = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    return toMonth > fromMonth;
  }, [from, to]);

  // Extract table rendering to avoid deeply nested JSX
  function renderTable() {
    return (
      <>
        {/* Conditional rendering based on tree and displayRows state */}
        {!statementTree ? (
          <div className="text-sm text-slate-700">Building hierarchy...</div>
        ) : displayRows.length === 0 ? (
          <div className="text-sm text-slate-700">No display rows generated.</div>
        ) : (
          <StatementTable
            rows={displayRows}
            columns={displayColumns}
            formatMoney={(val) => {
              if (val == null || !Number.isFinite(val)) return "—";
              const absValue = Math.abs(val);
              const formatted = absValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              return val < 0 ? `(${formatted})` : formatted;
            }}
          />
        )}
      </>
    );
  }

  async function loadPnlAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading P&L...");
      setRaw(null);
      setSeriesData(null);

      // Use series endpoint if spanning multiple months
      if (spansMultipleMonths) {
        const series = await loadPnlSeries(orgId, from, to);
        setSeriesData(series);
        setUseSeries(true);
        setStatus(`P&L loaded ✅ (${series.months.length} month(s))`);
      } else {
        const data = await loadPnl(orgId, from, to);
        setRaw(data);
        setUseSeries(false);
        setStatus("P&L loaded ✅");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  // Auto-load on open and whenever org/period changes
  useEffect(() => {
    void loadPnlAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to, spansMultipleMonths]);

  return (
    <div className="min-h-screen bg-slate-50">
      

      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <ReportHeader
          title="P&L"
          orgLine={`orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`}
          controls={
            <>
              <button
                className={`${ui.btn} ${ui.btnGhost}`}
                onClick={() => setShowRaw((v) => !v)}
                disabled={!raw}
                title={!raw ? "Load the P&L first" : ""}
              >
                {showRaw ? "Hide raw JSON" : "Show raw JSON"}
              </button>
              {raw?.reportUrl && (
                <a className={ui.linkBtn} href={raw.reportUrl} target="_blank" rel="noreferrer">
                  Open QBO report →
                </a>
              )}
            </>
          }
          statusText={status || "—"}
        />

        {showRaw && raw && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">Raw JSON Response</div>
            <pre className="text-xs overflow-auto bg-slate-50 p-4 rounded-lg max-h-[36rem]">
              {JSON.stringify(raw, null, 2)}
            </pre>
          </div>
        )}

        {!showRaw && (useSeries ? seriesData : raw) && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
            {useSeries && seriesData && (
              <div className="mb-3 text-xs text-slate-600">
                Multi-month view: {seriesData.months.length} month(s) • Start = 0 (flow statement), End = sum of months
              </div>
            )}
            {!useSeries && raw && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-900">Report</div>
                <div className="text-xs text-slate-600">
                  Basis: <span className="font-semibold text-slate-900">{pnl?.Header?.ReportBasis || "—"}</span> •
                  Currency: <span className="font-semibold text-slate-900">{pnl?.Header?.Currency || "—"}</span>
                </div>
              </div>
            )}
            {renderTable()}
          </div>
        )}
      </main>
    </div>
  );
}
