"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ui } from "@/components/ui";
import { loadBalanceSheet, loadBalanceSheetSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { SeriesTable } from "@/components/SeriesTable";
import { flattenQboRows } from "@/lib/qboFlatten";
import { buildStatementTree, flattenStatementTree, type StatementRow } from "@/lib/statementTree";
import { StatementTable } from "@/components/StatementTable";
import { ReportHeader } from "@/components/ReportHeader";
import { exportRowsToXlsx } from "@/lib/exportXlsx";

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

function toNumber(v?: string): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractBsTotals(rows: RowNode[], totalColIndex: number = 1): {
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  net: number | null;
} {
  let assets: number | null = null;
  let liabilities: number | null = null;
  let equity: number | null = null;

  function walkRows(rows: RowNode[]) {
    for (const r of rows || []) {
      const label = String(firstCell(r)?.value ?? "").trim().toUpperCase();
      const isSection = r.type === "Section";
      const summary = r.Summary?.ColData || [];

      if (isSection && summary.length > totalColIndex) {
        const totalValue = summary[totalColIndex]?.value;
        const totalNum = toNumber(totalValue);

        if (label.includes("ASSET") && !label.includes("LIABILIT") && !label.includes("EQUITY")) {
          if (assets == null || Math.abs(totalNum ?? 0) > Math.abs(assets ?? 0)) {
            assets = totalNum;
          }
        } else if (label.includes("LIABILIT")) {
          if (liabilities == null || Math.abs(totalNum ?? 0) > Math.abs(liabilities ?? 0)) {
            liabilities = totalNum;
          }
        } else if (label.includes("EQUITY")) {
          if (equity == null || Math.abs(totalNum ?? 0) > Math.abs(equity ?? 0)) {
            equity = totalNum;
          }
        }
      }

      if (r.Rows?.Row) {
        walkRows(r.Rows.Row);
      }
    }
  }

  walkRows(rows);

  const net =
    assets != null && liabilities != null && equity != null
      ? assets - liabilities - equity
      : null;

  return { assets, liabilities, equity, net };
}

function firstCell(r: RowNode): ColData {
  const cd = r.ColData || r.Header?.ColData || [];
  return (cd?.[0] ?? {}) as ColData;
}

type BalanceSheetViewProps = {
  compact?: boolean;
};

export function BalanceSheetView({ compact = false }: BalanceSheetViewProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [useSeries, setUseSeries] = useState(false);
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [showGrouped, setShowGrouped] = useState(true);

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

  async function loadBsAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading Balance Sheet...");
      setRaw(null);
      setSeriesData(null);

      // ALWAYS use series endpoint, even for single month
      const series = await loadBalanceSheetSeries(orgId, from, to);
      setSeriesData(series);
      setUseSeries(true);
      
      // Debug logging for single-month
      if (isSingleMonth && process.env.NODE_ENV === "development") {
        const firstLeaf = series.rows.find((r) => r.values && Object.keys(r.values).length > 0);
        console.log("[SINGLE_BS_ROW_SAMPLE]", {
          columnsCount: series.columns.length,
          columns: series.columns,
          months: series.months,
          firstLeafAccount: firstLeaf?.account_name,
          firstLeafValues: firstLeaf?.values,
          totalRows: series.rows.length,
        });
      }
      
      setStatus(`Balance Sheet loaded ✅ (${series.months.length} month(s))`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadBsAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to]);

  const bs = raw?.bs;

  const columns: string[] = useMemo(() => {
    const cols: Col[] = bs?.Columns?.Column || [];
    if (!Array.isArray(cols) || cols.length === 0) return ["Account", "Total"];
    return cols.map((c, i) => c?.ColTitle || (i === 0 ? "Account" : ""));
  }, [bs]);

  const rows: RowNode[] = useMemo(() => {
    const top = bs?.Rows?.Row || [];
    return Array.isArray(top) ? top : [];
  }, [bs]);

  const flatRows = useMemo(() => {
    if (!bs || rows.length === 0) return [];
    return flattenQboRows(rows, columns.slice(1));
  }, [bs, rows, columns]);

  const statementRowsFromBs: StatementRow[] = useMemo(() => {
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
    return statementRowsFromBs;
  }, [useSeries, seriesData, statementRowsFromSeries, statementRowsFromBs]);

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
      statementType: "bs",
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
      label: col || (idx === 0 ? "Account" : ""),
    }));
  }, [useSeries, seriesData, columns]);

  const bsTotals = useMemo(() => {
    if (!bs || rows.length === 0) return null;
    const cols = bs?.Columns?.Column || [];
    const totalColIndex = cols.findIndex((c: Col) => String(c?.ColTitle ?? "").toUpperCase().includes("TOTAL"));
    const colIndex = totalColIndex >= 0 ? totalColIndex : 1;
    return extractBsTotals(rows, colIndex);
  }, [bs, rows]);

  // Export to Excel
  function handleExport() {
    if (useSeries && seriesData) {
      const rows = seriesData.rows.map((row) => ({
        Account: row.account_name,
        ...Object.fromEntries(seriesData.columns.map((col) => [col, row.values[col] ?? 0])),
      }));
      exportRowsToXlsx(`BS_${from}_${to}`, "Balance Sheet", rows);
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
      exportRowsToXlsx(`BS_${from}_${to}`, "Balance Sheet", rows);
    }
  }

  const hasSeries = !!seriesData;
  const viewData = useSeries && hasSeries ? seriesData : raw;

  function renderTable() {
    if (!statementTree) {
      return <div className="text-sm text-slate-700">Building hierarchy...</div>;
    }
    if (displayRows.length === 0) {
      return <div className="text-sm text-slate-700">No display rows generated.</div>;
    }

    return (
      <>
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

        {bsTotals && !useSeries && (
          <div
            className={`mt-6 rounded-2xl border-2 p-4 ${
              bsTotals.net != null && Math.abs(bsTotals.net) > 0.01
                ? "border-red-300 bg-red-50/80"
                : "border-green-300 bg-green-50/80"
            }`}
          >
            <div className="text-sm font-bold text-slate-900 mb-2">Balance Sheet Net Check</div>
            <div className="text-xs text-slate-700 space-y-1">
              <div>
                Assets: <span className="font-semibold">{money(String(bsTotals.assets ?? ""))}</span>
              </div>
              <div>
                Liabilities: <span className="font-semibold">{money(String(bsTotals.liabilities ?? ""))}</span>
              </div>
              <div>
                Equity: <span className="font-semibold">{money(String(bsTotals.equity ?? ""))}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-300">
                Net (Assets - Liabilities - Equity):{" "}
                <span
                  className={`font-bold ${
                    bsTotals.net != null && Math.abs(bsTotals.net) > 0.01 ? "text-red-700" : "text-green-700"
                  }`}
                >
                  {money(String(bsTotals.net ?? ""))}
                </span>
                {bsTotals.net != null && Math.abs(bsTotals.net) > 0.01 && (
                  <span className="ml-2 text-red-700 font-semibold">⚠️ Does not net to zero!</span>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const orgLine = `orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <ReportHeader
        title="BS"
        orgLine={orgLine}
        controls={
          <>
            {!compact && (
              <>
                <button
                  className={`${ui.btn} ${ui.btnGhost}`}
                  onClick={() => setShowRaw((v) => !v)}
                  disabled={!raw}
                  title={!raw ? "Load the Balance Sheet first" : ""}
                >
                  {showRaw ? "Hide raw JSON" : "Show raw JSON"}
                </button>
                {hasSeries && (
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useSeries}
                      onChange={(e) => setUseSeries(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Use series view</span>
                  </label>
                )}
                {!useSeries && raw && statementTree && (
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showGrouped}
                      onChange={(e) => setShowGrouped(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Grouped view</span>
                  </label>
                )}
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
              title={!raw && !seriesData ? "Load the Balance Sheet first" : "Export Balance Sheet to Excel"}
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

      {(!compact || !showRaw) && viewData && (
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
          {useSeries && hasSeries ? (
            <div>
              <div className="mb-3 text-xs text-slate-600">
                Multi-month view: {seriesData.months.length} month(s) • Start = {priorDay(from)}, End = {to}
              </div>
              {renderTable()}
            </div>
          ) : (
            <>
              {!compact && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <div className="text-sm font-semibold text-slate-900">Report</div>
                  <div className="text-xs text-slate-600">
                    Basis: <span className="font-semibold text-slate-900">{bs?.Header?.ReportBasis || "—"}</span> •
                    Currency: <span className="font-semibold text-slate-900">{bs?.Header?.Currency || "—"}</span>
                  </div>
                </div>
              )}
              {renderTable()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

