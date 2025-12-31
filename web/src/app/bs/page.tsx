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

/**
 * Extract Assets, Liabilities, and Equity totals from QBO Balance Sheet structure.
 * QBO typically has sections like "ASSETS", "LIABILITIES AND EQUITY", etc.
 * Returns { assets, liabilities, equity, net } where net = assets - liabilities - equity
 */
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

      // Extract total from Summary.ColData (usually index 1 is the "Total" column)
      if (isSection && summary.length > totalColIndex) {
        const totalValue = summary[totalColIndex]?.value;
        const totalNum = toNumber(totalValue);

        // Match section labels (QBO uses various formats)
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

      // Recursively walk children
      if (r.Rows?.Row) {
        walkRows(r.Rows.Row);
      }
    }
  }

  walkRows(rows);

  // Calculate net: Assets - Liabilities - Equity
  const net =
    assets != null && liabilities != null && equity != null
      ? assets - liabilities - equity
      : null;

  return { assets, liabilities, equity, net };
}

function isNumberish(v?: string) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  return /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(s) || /^-?\d+(?:\.\d+)?$/.test(s);
}

function firstCell(r: RowNode): ColData {
  const cd = r.ColData || r.Header?.ColData || [];
  return (cd?.[0] ?? {}) as ColData;
}

function getRowCells(r: RowNode): ColData[] {
  const cd = r.ColData || r.Header?.ColData || [];
  return (cd ?? []) as ColData[];
}

function slugKey(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 80);
}

function renderRows({
  rows,
  level,
  columnsCount,
  parentKey,
  collapsed,
  toggleCollapsed,
}: {
  rows: RowNode[];
  level: number;
  columnsCount: number;
  parentKey: string;
  collapsed: Set<string>;
  toggleCollapsed: (key: string) => void;
}): ReactNode[] {
  const out: ReactNode[] = [];

  rows.forEach((r, idx) => {
    const cells = getRowCells(r);
    const label = String(firstCell(r)?.value ?? "").trim();
    const id = String(firstCell(r)?.id ?? "").trim();

    const isSection = r.type === "Section";
    const children = r.Rows?.Row || [];
    const hasChildren = Array.isArray(children) && children.length > 0;
    const summary = r.Summary?.ColData?.map((c) => c?.value ?? "") || [];

    const nodeKey = `${parentKey}/${idx}-${slugKey(label || r.group || r.type || "row")}`;
    const isCollapsed = collapsed.has(nodeKey);

    if (isSection && hasChildren) {
      out.push(
        <tr key={`${nodeKey}#section`} className="bg-slate-50/70 border-b border-slate-200">
          <td className="px-4 py-3 font-semibold text-slate-900">
            <div style={{ paddingLeft: 12 * level }} className="flex items-center gap-2">
              <button
                className={[
                  "h-7 w-7 inline-flex items-center justify-center rounded-lg",
                  "border border-slate-200 bg-white",
                  "hover:scale-110 active:scale-110 transition-transform",
                  "text-slate-700",
                ].join(" ")}
                onClick={() => toggleCollapsed(nodeKey)}
                aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>

              {id ? (
                <span className="text-[11px] tabular-nums rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                  {id}
                </span>
              ) : null}

              <span>{label || "—"}</span>
            </div>
          </td>

          {Array.from({ length: columnsCount - 1 }).map((_, i) => (
            <td
              key={`${nodeKey}#section-pad-${i}`}
              className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900"
            />
          ))}
        </tr>
      );

      if (!isCollapsed) {
        out.push(
          ...renderRows({
            rows: children,
            level: level + 1,
            columnsCount,
            parentKey: `${nodeKey}#children`,
            collapsed,
            toggleCollapsed,
          })
        );

        if (summary.length > 1) {
          out.push(
            <tr key={`${nodeKey}#summary`} className="border-b border-slate-200 bg-white">
              <td className="px-4 py-3 font-semibold text-slate-900">
                <div style={{ paddingLeft: 12 * level }}>{label} — Total</div>
              </td>
              {summary.slice(1).map((v, i) => (
                <td key={`${nodeKey}#summary-${i}`} className="px-4 py-3 text-right tabular-nums font-semibold">
                  {isNumberish(String(v)) ? money(String(v)) : String(v)}
                </td>
              ))}
              {summary.length - 1 < columnsCount - 1 &&
                Array.from({ length: columnsCount - 1 - (summary.length - 1) }).map((_, k) => (
                  <td key={`${nodeKey}#summary-pad-${k}`} />
                ))}
            </tr>
          );
        }
      }
      return;
    }

    // Leaf/data-ish row
    out.push(
      <tr key={`${nodeKey}#row`} className="border-b border-slate-100 hover:bg-slate-50/60">
        <td className="px-4 py-2.5 text-slate-900">
          <div style={{ paddingLeft: 12 * level }} className="flex items-center gap-2">
            {id ? (
              <span className="text-[11px] tabular-nums rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                {id}
              </span>
            ) : null}
            <span className="font-medium">{label || "—"}</span>
          </div>
        </td>

        {cells.slice(1).map((c, i) => {
          const v = c?.value ?? "";
          return (
            <td key={`${nodeKey}#cell-${i}`} className="px-4 py-2.5 text-right tabular-nums text-slate-800">
              {isNumberish(String(v)) ? money(String(v)) : String(v)}
            </td>
          );
        })}

        {cells.length - 1 < columnsCount - 1 &&
          Array.from({ length: columnsCount - 1 - (cells.length - 1) }).map((_, k) => (
            <td key={`${nodeKey}#pad-${k}`} />
          ))}
      </tr>
    );
  });

  return out;
}

function ReportTable({
  columns,
  rows,
  collapsed,
  toggleCollapsed,
}: {
  columns: string[];
  rows: RowNode[];
  collapsed: Set<string>;
  toggleCollapsed: (key: string) => void;
}) {
  const columnsCount = Math.max(columns.length, 2);

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-[980px] w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={[
                  "px-4 py-3 text-left font-semibold text-slate-700",
                  i === 0 ? "min-w-[420px]" : "text-right min-w-[140px]",
                ].join(" ")}
              >
                {c || (i === 0 ? "Account" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{renderRows({ rows, level: 0, columnsCount, parentKey: "bs", collapsed, toggleCollapsed })}</tbody>
      </table>
    </div>
  );
}

export default function BalanceSheetPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [useSeries, setUseSeries] = useState(false);
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [showGrouped, setShowGrouped] = useState(true);

  // Check if range spans multiple months
  const spansMultipleMonths = useMemo(() => {
    if (!from || !to) return false;
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const fromMonth = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const toMonth = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    return toMonth > fromMonth;
  }, [from, to]);

  function priorDay(dateISO: string): string {
    const d = new Date(dateISO + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
  }

  async function loadBsAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading Balance Sheet...");
      setRaw(null);
      setSeriesData(null);

      // Use series endpoint if spanning multiple months
      if (spansMultipleMonths) {
        const series = await loadBalanceSheetSeries(orgId, from, to);
        setSeriesData(series);
        setUseSeries(true);
        setStatus(`Balance Sheet loaded ✅ (${series.months.length} month(s))`);
      } else {
        const data = await loadBalanceSheet(orgId, from, to);
        setRaw(data);
        setUseSeries(false);
        setStatus("Balance Sheet loaded ✅");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadBsAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to, spansMultipleMonths]);

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

  // Flatten QBO rows to extract paths and values
  const flatRows = useMemo(() => {
    if (!bs || rows.length === 0) return [];
    return flattenQboRows(rows, columns.slice(1)); // Skip first column (Account)
  }, [bs, rows, columns]);

  // Convert FlatRow to StatementRow format (for single-month view)
  const statementRowsFromBs: StatementRow[] = useMemo(() => {
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
      // SeriesRow.account_name is the full path like "ASSETS / Current Assets / Bank Accounts / Checking"
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

  // Use series data if available and enabled, otherwise use BS data
  const statementRows: StatementRow[] = useMemo(() => {
    if (useSeries && seriesData) {
      return statementRowsFromSeries;
    }
    return statementRowsFromBs;
  }, [useSeries, seriesData, statementRowsFromSeries, statementRowsFromBs]);

  // Build statement tree with proper grouping (works for both single-month and series views)
  const statementTree = useMemo(() => {
    if (statementRows.length === 0) return null;
    
    // For series view, use series columns; for single-month, use BS columns
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
      includeStatementTotals: true,
      indentPerLevel: 16,
      statementType: "bs",
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

  // Calculate net check: Assets = Liabilities + Equity
  const bsTotals = useMemo(() => {
    if (!bs || rows.length === 0) return null;
    // Find the "Total" column index (usually index 1, but check Columns)
    const cols = bs?.Columns?.Column || [];
    const totalColIndex = cols.findIndex((c: Col) =>
      String(c?.ColTitle ?? "").toUpperCase().includes("TOTAL")
    );
    const colIndex = totalColIndex >= 0 ? totalColIndex : 1;
    return extractBsTotals(rows, colIndex);
  }, [bs, rows]);

  // Calculate balance check per column for series data
  const seriesBalanceCheck = useMemo(() => {
    if (!seriesData) return null;
    const { rows: seriesRows, columns: seriesColumns } = seriesData;
    
    // Find Assets, Liabilities, and Equity rows
    let assetsTotal: Record<string, number> = {};
    let liabilitiesTotal: Record<string, number> = {};
    let equityTotal: Record<string, number> = {};
    
    for (const row of seriesRows) {
      const name = String(row.account_name || "").trim().toUpperCase();
      const isAssets = name.includes("ASSET") && !name.includes("LIABILIT") && !name.includes("EQUITY");
      const isLiabilities = name.includes("LIABILIT");
      const isEquity = name.includes("EQUITY") && !name.includes("LIABILIT");
      
      if (isAssets || isLiabilities || isEquity) {
        for (const colKey of seriesColumns) {
          const val = row.values[colKey] ?? 0;
          if (isAssets) {
            assetsTotal[colKey] = (assetsTotal[colKey] ?? 0) + val;
          } else if (isLiabilities) {
            liabilitiesTotal[colKey] = (liabilitiesTotal[colKey] ?? 0) + val;
          } else if (isEquity) {
            equityTotal[colKey] = (equityTotal[colKey] ?? 0) + val;
          }
        }
      }
    }
    
    // Compute diff per column: Assets - Liabilities - Equity
    const balanceCheck: Record<string, number> = {};
    for (const colKey of seriesColumns) {
      const assets = assetsTotal[colKey] ?? 0;
      const liabilities = liabilitiesTotal[colKey] ?? 0;
      const equity = equityTotal[colKey] ?? 0;
      balanceCheck[colKey] = assets - liabilities - equity;
    }
    
    return balanceCheck;
  }, [seriesData]);

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Safe helpers before JSX
  const hasSeries = !!seriesData;
  const viewData = useSeries && hasSeries ? seriesData : raw;

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
            
            {/* Net Check: Assets = Liabilities + Equity */}
            {bsTotals && !useSeries && (
              <div className={`mt-6 rounded-2xl border-2 p-4 ${
                bsTotals.net != null && Math.abs(bsTotals.net) > 0.01
                  ? "border-red-300 bg-red-50/80"
                  : "border-green-300 bg-green-50/80"
              }`}>
                <div className="text-sm font-bold text-slate-900 mb-2">Balance Sheet Net Check</div>
                <div className="text-xs text-slate-700 space-y-1">
                  <div>Assets: <span className="font-semibold">{money(String(bsTotals.assets ?? ""))}</span></div>
                  <div>Liabilities: <span className="font-semibold">{money(String(bsTotals.liabilities ?? ""))}</span></div>
                  <div>Equity: <span className="font-semibold">{money(String(bsTotals.equity ?? ""))}</span></div>
                  <div className="mt-2 pt-2 border-t border-slate-300">
                    Net (Assets - Liabilities - Equity):{" "}
                    <span className={`font-bold ${
                      bsTotals.net != null && Math.abs(bsTotals.net) > 0.01
                        ? "text-red-700"
                        : "text-green-700"
                    }`}>
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
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <ReportHeader
          title="BS"
          orgLine={`orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`}
          controls={
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

        {!showRaw && viewData && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
            {useSeries && hasSeries ? (
              <div>
                <div className="mb-3 text-xs text-slate-600">
                  Multi-month view: {seriesData.months.length} month(s) • Start = {priorDay(from)}, End = {to}
                </div>
                {/* OLD SeriesTable - COMMENTED OUT - Using StatementTable instead */}
                {false && <SeriesTable data={seriesData} reportType="bs" from={from} to={to} balanceCheck={seriesBalanceCheck || undefined} />}
                {/* Use StatementTable for series view too */}
                {renderTable()}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <div className="text-sm font-semibold text-slate-900">Report</div>
                  <div className="text-xs text-slate-600">
                    Basis: <span className="font-semibold text-slate-900">{bs?.Header?.ReportBasis || "—"}</span> •
                    Currency: <span className="font-semibold text-slate-900">{bs?.Header?.Currency || "—"}</span>
                  </div>
                </div>

                {renderTable()}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
