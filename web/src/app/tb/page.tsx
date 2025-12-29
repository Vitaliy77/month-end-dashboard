"use client";

import { useEffect, useMemo, useState } from "react";

import { ui } from "@/components/ui";
import { loadTrialBalance, loadTrialBalanceSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { SeriesTable } from "@/components/SeriesTable";

type TbRow = {
  accountId?: string;
  accountName?: string;
  accountType?: string;
  beginning?: number | null;
  debit?: number | null;
  credit?: number | null;
  ending?: number | null;
};

function toIsoDate(s: string) {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return trimmed;
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalancePage() {
  const { state } = useOrgPeriod(); // orgId/orgName/from/to
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TbRow[]>([]);
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [useSeries, setUseSeries] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.accountId ?? ""} ${r.accountName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  // Check if range spans multiple months
  const spansMultipleMonths = useMemo(() => {
    if (!from || !to) return false;
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const fromMonth = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const toMonth = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    return toMonth > fromMonth;
  }, [from, to]);

  async function loadTbAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading TB...");
      setRows([]);
      setRaw(null);
      setSeriesData(null);

      const fromIso = toIsoDate(from);
      const toIso = toIsoDate(to);

      // Use series endpoint if spanning multiple months
      if (spansMultipleMonths) {
        const series = await loadTrialBalanceSeries(orgId, fromIso, toIso);
        setSeriesData(series);
        setUseSeries(true);
        setStatus(`TB loaded ✅ (${series.months.length} month(s))`);
      } else {
        const json = await loadTrialBalance(orgId, fromIso, toIso);
        setRaw(json);
        setUseSeries(false);

      const qboRows = json?.tb?.Rows?.Row ?? [];
      const normalized: TbRow[] = Array.isArray(qboRows)
        ? qboRows
            .filter((r: any) => Array.isArray(r?.ColData))
            .map((r: any) => {
              const cols = r.ColData;

              const name = cols?.[0]?.value ?? "";
              const accountId = cols?.[0]?.id ?? "";

              const c1 = cols?.[1]?.value ?? "";
              const c2 = cols?.[2]?.value ?? "";
              const c3 = cols?.[3]?.value ?? "";
              const c4 = cols?.[4]?.value ?? "";
              const c5 = cols?.[5]?.value ?? "";

              const nums = [c1, c2, c3, c4, c5].map(toNumber);

              const debit = toNumber(c1);
              const credit = toNumber(c2);

              const numericPositions = nums
                .map((v, i) => ({ v, i }))
                .filter((x) => x.v != null);

              const beginning = numericPositions.length >= 3 ? numericPositions[0].v : null;
              const ending =
                numericPositions.length >= 3 ? numericPositions[numericPositions.length - 1].v : null;

              const possibleType =
                [c1, c2, c3, c4, c5].find((x) => x && toNumber(x) == null) ?? "";

              return {
                accountId,
                accountName: name,
                accountType: possibleType || undefined,
                beginning,
                debit: debit ?? null,
                credit: credit ?? null,
                ending,
              };
            })
            .filter((r: any) => (r.accountName || "").toUpperCase() !== "TOTAL")
        : [];

        setRows(normalized);
        setStatus("TB loaded ✅");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  function priorDay(dateISO: string): string {
    const d = new Date(dateISO + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
  }

  // Auto-load on open and whenever org/period changes
  useEffect(() => {
    void loadTbAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to, spansMultipleMonths]);

  const inputCls =
    "mt-2 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-200";

  return (
    <div className="min-h-screen bg-slate-50">
      

      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-6">
          <div className="text-xs font-extrabold uppercase tracking-[.18em] text-slate-500">Trial Balance</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">TB Report</div>

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
              title={!raw ? "Load the TB first" : ""}
            >
              {showRaw ? "Hide raw JSON" : "Show raw JSON"}
            </button>

            <div className="min-w-[280px]">
              <label className="block text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                Search accounts
              </label>
              <input
                className={inputCls}
                placeholder="Type account id or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="mt-2 text-xs text-slate-600">
                Showing <span className="font-semibold text-slate-900">{filtered.length}</span> of{" "}
                <span className="font-semibold text-slate-900">{rows.length}</span>
              </div>
            </div>
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

        {!showRaw && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
            {useSeries && seriesData ? (
              <div>
                <div className="mb-3 text-xs text-slate-600">
                  Multi-month view: {seriesData.months.length} month(s) • Start = {priorDay(from)}, End = {to}
                </div>
                <SeriesTable data={seriesData} reportType="tb" from={from} to={to} />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-slate-600">No balances returned for this period.</div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-semibold text-slate-700 min-w-[140px]">Account ID</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 min-w-[360px]">Account Name</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 min-w-[160px]">Type</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[140px]">Beginning</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[140px]">Debit</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[140px]">Credit</th>
                      <th className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[140px]">Ending</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((r, i) => (
                      <tr
                        key={r.accountId || `${r.accountName}-${i}`}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-2.5 text-slate-700 tabular-nums">{r.accountId || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-900">{r.accountName || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.accountType || "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">{fmt(r.beginning)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">{fmt(r.debit)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">{fmt(r.credit)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">{fmt(r.ending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
