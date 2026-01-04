"use client";

import { useEffect, useMemo, useState } from "react";
import { ui } from "@/components/ui";
import { loadCashFlow, loadCashFlowSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { flattenQboRows } from "@/lib/qboFlatten";
import { buildStatementTree, flattenStatementTree, type StatementRow } from "@/lib/statementTree";
import { StatementTable } from "@/components/StatementTable";
import { ReportHeader } from "@/components/ReportHeader";
import { exportRowsToXlsx } from "@/lib/exportXlsx";

type Col = { ColTitle?: string; ColType?: string; MetaData?: any[] };
type RowNode = {
  type?: string;
  group?: string;
  ColData?: any[];
  Header?: { ColData?: any[] };
  Summary?: { ColData?: any[] };
  Rows?: { Row?: RowNode[] };
};

type CashFlowViewProps = {
  compact?: boolean;
};

export function CashFlowView({ compact = false }: CashFlowViewProps) {
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

  // Helper to compute month buckets (same logic as API)
  const monthBuckets = useMemo(() => {
    if (!from || !to) return [];
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T23:59:59Z");
    if (fromDate > toDate) return [];

    const buckets: Array<{ key: string; from: string; to: string }> = [];
    let current = new Date(fromDate);

    while (current <= toDate) {
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;

      if (buckets.length === 0) {
        const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
        const bucketTo = monthEnd < toDate ? monthEnd : toDate;
        buckets.push({
          key,
          from: from,
          to: bucketTo.toISOString().split("T")[0],
        });
      } else {
        const monthStart = new Date(Date.UTC(year, month, 1));
        const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
        const bucketFrom = monthStart > fromDate ? monthStart : fromDate;
        const bucketTo = monthEnd < toDate ? monthEnd : toDate;

        buckets.push({
          key,
          from: bucketFrom.toISOString().split("T")[0],
          to: bucketTo.toISOString().split("T")[0],
        });
      }

      current = new Date(Date.UTC(year, month + 1, 1));
    }

    return buckets;
  }, [from, to]);

  const isSingleMonth = monthBuckets.length === 1;

  async function loadCfAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading Cash Flow...");
      setRaw(null);
      setSeriesData(null);

      // ALWAYS use series endpoint, even for single month
      const series = await loadCashFlowSeries(orgId, from, to);
      setSeriesData(series);
      setUseSeries(true);
      
      // Debug logging for single-month
      if (isSingleMonth && process.env.NODE_ENV === "development") {
        const firstLeaf = series.rows.find((r) => r.values && Object.keys(r.values).length > 0);
        console.log("[SINGLE_CF_ROW_SAMPLE]", {
          columnsCount: series.columns.length,
          columns: series.columns,
          months: series.months,
          firstLeafAccount: firstLeaf?.account_name,
          firstLeafValues: firstLeaf?.values,
          totalRows: series.rows.length,
        });
      }
      
      setStatus(`Cash Flow loaded ✅ (${series.months.length} month(s))`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadCfAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to]);

  const cf = raw?.cf;

  const columns: string[] = useMemo(() => {
    const cols: Col[] = cf?.Columns?.Column || [];
    if (!Array.isArray(cols) || cols.length === 0) return ["Line", "Total"];
    return cols.map((c, i) => c?.ColTitle || (i === 0 ? "Line" : ""));
  }, [cf]);

  const rows: RowNode[] = useMemo(() => {
    const top = cf?.Rows?.Row || [];
    return Array.isArray(top) ? top : [];
  }, [cf]);

  const flatRows = useMemo(() => {
    if (!cf || rows.length === 0) return [];
    return flattenQboRows(rows, columns.slice(1));
  }, [cf, rows, columns]);

  const statementRowsFromCf: StatementRow[] = useMemo(() => {
    return flatRows.map((row) => ({
      account_id: row.accountId,
      account_path: row.path,
      account_name: row.label,
      ...row.values,
    }));
  }, [flatRows]);

  const statementRowsFromSeries: StatementRow[] = useMemo(() => {
    if (!seriesData || !seriesData.rows) return [];
    return seriesData.rows.map((row) => {
      const fullPath = row.account_name || "";
      const pathSegments = fullPath.split(" / ").filter(Boolean);
      const leafName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : fullPath;

      return {
        account_id: row.account_id || undefined,
        account_path: fullPath,
        account_name: leafName,
        ...row.values,
      };
    });
  }, [seriesData]);

  const statementRows: StatementRow[] = useMemo(() => {
    if (useSeries && seriesData) {
      return statementRowsFromSeries;
    }
    return statementRowsFromCf;
  }, [useSeries, seriesData, statementRowsFromSeries, statementRowsFromCf]);

  const statementTree = useMemo(() => {
    if (statementRows.length === 0) return null;

    const columnKeys = useSeries && seriesData ? seriesData.columns : columns.slice(1);

    return buildStatementTree(statementRows, {
      pathAccessor: (row) => row.account_path || row.account_name || "",
      accountIdAccessor: (row) => row.account_id,
      columnKeys,
    });
  }, [statementRows, columns, useSeries, seriesData]);

  const displayRows = useMemo(() => {
    if (!statementTree) return [];

    const columnKeys = useSeries && seriesData ? seriesData.columns : columns.slice(1);

    return flattenStatementTree(statementTree, {
      includeSubtotals: true,
      includeStatementTotals: true,
      indentPerLevel: 16,
      statementType: "cf",
      columnKeys,
    });
  }, [statementTree, useSeries, seriesData, columns]);

  type ColumnModel = { key: string; label: string };

  const displayColumns: ColumnModel[] = useMemo(() => {
    if (useSeries && seriesData) {
      return [
        { key: "account", label: "Account" },
        ...seriesData.columns.map((col) => {
          if (col === "start") return { key: "start", label: "Start" };
          if (col === "end") return { key: "end", label: "End" };
          const [year, month] = col.split("-");
          const monthNum = parseInt(month, 10);
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return { key: col, label: `${monthNames[monthNum - 1]} ${year}` };
        }),
      ];
    }
    return columns.map((col, idx) => ({
      key: idx === 0 ? "account" : col || `col${idx}`,
      label: col || (idx === 0 ? "Line" : ""),
    }));
  }, [useSeries, seriesData, columns]);

  function renderTable() {
    if (!statementTree) {
      return <div className="text-sm text-slate-700">Building hierarchy...</div>;
    }
    if (displayRows.length === 0) {
      return <div className="text-sm text-slate-700">No display rows generated.</div>;
    }

    return (
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
    );
  }

  // Export to Excel
  function handleExport() {
    if (useSeries && seriesData) {
      const rows = seriesData.rows.map((row) => ({
        Account: row.account_name,
        ...Object.fromEntries(seriesData.columns.map((col) => [col, row.values[col] ?? 0])),
      }));
      exportRowsToXlsx(`CF_${from}_${to}`, "Cash Flow", rows);
    } else {
      const rows = displayRows
        .filter((r) => !r.isGroup)
        .map((r) => {
          const row: Record<string, any> = { Account: r.label };
          for (const col of displayColumns.slice(1)) {
            const val = (r.values as Record<string, any>)?.[col.key];
            row[col.label] = val ?? 0;
          }
          return row;
        });
      exportRowsToXlsx(`CF_${from}_${to}`, "Cash Flow", rows);
    }
  }

  const orgLine = `orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <ReportHeader
        title="CF"
        orgLine={orgLine}
        controls={
          <>
            {!compact && (
              <>
                <button
                  className={`${ui.btn} ${ui.btnGhost}`}
                  onClick={() => setShowRaw((v) => !v)}
                  disabled={!raw}
                  title={!raw ? "Load the Cash Flow first" : ""}
                >
                  {showRaw ? "Hide raw JSON" : "Show raw JSON"}
                </button>
                {raw?.reportUrl && (
                  <a className={ui.linkBtn} href={raw.reportUrl} target="_blank" rel="noreferrer">
                    Open QBO report →
                  </a>
                )}
              </>
            )}
            <button
              className={`${ui.btn} ${ui.btnGhost}`}
              onClick={handleExport}
              disabled={!raw && !seriesData}
              title={!raw && !seriesData ? "Load the Cash Flow first" : "Export Cash Flow to Excel"}
            >
              Export (Excel)
            </button>
          </>
        }
        statusText={status || "—"}
      />

      {!compact && showRaw && raw && (
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
          <div className="text-sm font-semibold text-slate-900 mb-3">Raw JSON Response</div>
          <pre className="text-xs overflow-auto bg-slate-50 p-4 rounded-lg max-h-[36rem]">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      )}

      {(!compact || !showRaw) && (useSeries ? seriesData : raw) && (
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
                Basis: <span className="font-semibold text-slate-900">{cf?.Header?.ReportBasis || "—"}</span> •
                Currency: <span className="font-semibold text-slate-900">{cf?.Header?.Currency || "—"}</span>
              </div>
            </div>
          )}
          {renderTable()}
        </div>
      )}
    </div>
  );
}

