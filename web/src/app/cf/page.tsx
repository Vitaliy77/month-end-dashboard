"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ui } from "@/components/ui";
import { loadCashFlow, loadCashFlowSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { SeriesTable } from "@/components/SeriesTable";

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
            <td key={`${nodeKey}#section-pad-${i}`} className="px-4 py-3 text-right tabular-nums font-semibold" />
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
            <tr key={`${nodeKey}#summary`} className="border-b border-slate-200">
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
                {c || (i === 0 ? "Line" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{renderRows({ rows, level: 0, columnsCount, parentKey: "cf", collapsed, toggleCollapsed })}</tbody>
      </table>
    </div>
  );
}

export default function CashFlowPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [useSeries, setUseSeries] = useState(false);

  // Check if range spans multiple months
  const spansMultipleMonths = useMemo(() => {
    if (!from || !to) return false;
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const fromMonth = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const toMonth = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    return toMonth > fromMonth;
  }, [from, to]);

  async function loadCfAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading Cash Flow...");
      setRaw(null);
      setSeriesData(null);

      // Use series endpoint if spanning multiple months
      if (spansMultipleMonths) {
        const series = await loadCashFlowSeries(orgId, from, to);
        setSeriesData(series);
        setUseSeries(true);
        setStatus(`Cash Flow loaded ✅ (${series.months.length} month(s))`);
      } else {
        const data = await loadCashFlow(orgId, from, to);
        setRaw(data);
        setUseSeries(false);
        setStatus("Cash Flow loaded ✅");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadCfAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to, spansMultipleMonths]);

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

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      

      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-6">
          <div className="text-xs font-extrabold uppercase tracking-[.18em] text-slate-500">Cash Flow</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">CF Report</div>

          <div className="mt-2 text-sm text-slate-600">
            orgId: <span className="font-semibold text-slate-900">{orgId || "—"}</span>
            {orgName ? (
              <>
                {" "}
                • <span className="font-semibold text-slate-900">{orgName}</span>
              </>
            ) : null}
            {" • "}Period: <span className="font-semibold text-slate-900">{from || "—"}</span> →{" "}
            <span className="font-semibold text-slate-900">{to || "—"}</span>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap items-start">
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
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
          <div className="text-sm font-semibold text-slate-900">Status</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{status}</div>
        </div>

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
            {useSeries && seriesData ? (
              <div>
                <div className="mb-3 text-xs text-slate-600">
                  Multi-month view: {seriesData.months.length} month(s) • Start = 0 (flow statement), End = sum of months
                </div>
                <SeriesTable data={seriesData} reportType="cf" from={from} to={to} />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <div className="text-sm font-semibold text-slate-900">Report</div>
                  <div className="text-xs text-slate-600">
                    Basis: <span className="font-semibold text-slate-900">{cf?.Header?.ReportBasis || "—"}</span> •
                    Currency: <span className="font-semibold text-slate-900">{cf?.Header?.Currency || "—"}</span>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <div className="text-sm text-slate-700">No rows returned.</div>
                ) : (
                  <ReportTable columns={columns} rows={rows} collapsed={collapsedKeys} toggleCollapsed={toggleCollapsed} />
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
