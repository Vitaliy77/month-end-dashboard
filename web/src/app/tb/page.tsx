"use client";

import { useEffect, useMemo, useState } from "react";

import { ui } from "@/components/ui";
import { loadTrialBalance, loadTrialBalanceSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { SeriesTable } from "@/components/SeriesTable";
import { REPORT_TABLE_STYLES } from "@/components/ReportTable";
import { ReportHeader } from "@/components/ReportHeader";

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
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [useSeries, setUseSeries] = useState(false);

  // Canonical rows from API: tb?.Rows?.Row ?? []
  const rawRows = useMemo(() => {
    if (!raw?.tb) return [];
    return raw.tb.Rows?.Row ?? [];
  }, [raw]);

  // Compute accounts directly from rawRows (no hierarchy flattening)
  const accounts = useMemo(() => {
    return rawRows
      .filter((r: any) => Array.isArray(r?.ColData) && r.ColData.length >= 1)
      .map((r: any) => ({
        accountId: r.ColData[0]?.id ?? "",
        accountName: String(r.ColData[0]?.value ?? "").trim(),
        debit: String(r.ColData[1]?.value ?? ""),
        credit: String(r.ColData[2]?.value ?? ""),
        beginning: String(r.ColData[3]?.value ?? ""),
        ending: String(r.ColData[4]?.value ?? ""),
      }))
      .filter((a: any) => a.accountName && a.accountName.toUpperCase() !== "TOTAL");
  }, [rawRows]);

  // Filtered accounts based on search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const hay = `${a.accountId ?? ""} ${a.accountName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [accounts, query]);

  // Compute totals from filtered accounts
  const totals = useMemo(() => {
    const totalBeginning = filtered.reduce((sum, a) => sum + (toNumber(a.beginning) ?? 0), 0);
    const totalDebit = filtered.reduce((sum, a) => sum + (toNumber(a.debit) ?? 0), 0);
    const totalCredit = filtered.reduce((sum, a) => sum + (toNumber(a.credit) ?? 0), 0);
    const totalEnding = filtered.reduce((sum, a) => sum + (toNumber(a.ending) ?? 0), 0);
    const balance = totalDebit - totalCredit;
    return { totalBeginning, totalDebit, totalCredit, totalEnding, balance };
  }, [filtered]);

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
      setRaw(null);
      setSeriesData(null);

      const fromIso = toIsoDate(from);
      const toIso = toIsoDate(to);

      // Always use flat TB endpoint (tb.Rows.Row structure) - NO hierarchy flattening
      const json = await loadTrialBalance(orgId, fromIso, toIso);
      setRaw(json);
      setUseSeries(false);
      
      // Accounts are computed via useMemo from raw, so just update status
      const rawRows = json?.tb?.Rows?.Row ?? [];
      const accountsCount = rawRows
        .filter((r: any) => Array.isArray(r?.ColData) && r.ColData.length >= 1)
        .filter((r: any) => {
          const name = String(r.ColData[0]?.value ?? "").trim().toUpperCase();
          return name && name !== "TOTAL";
        }).length;
      
      setStatus(`TB loaded ✅ (${accountsCount} account(s))`);
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
        <ReportHeader
          title="TB"
          orgLine={`orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`}
          controls={
            <>
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
                  <span className="font-semibold text-slate-900">{accounts.length}</span> account(s)
                </div>
              </div>
            </>
          }
          statusText={status || "—"}
          debugText={
            accounts.length > 0
              ? `Debug: rawRows=${rawRows.length} • accounts=${accounts.length} • filtered=${filtered.length} • First: ${accounts.slice(0, 3).map((a: any) => a.accountName).join(", ")}`
              : undefined
          }
        />

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
            ) : accounts.length === 0 ? (
              <div className="text-sm text-slate-600">No balances returned for this period.</div>
            ) : (
              <div className={REPORT_TABLE_STYLES.container}>
                  <table className={REPORT_TABLE_STYLES.table}>
                    <thead className={REPORT_TABLE_STYLES.thead}>
                      <tr>
                        <th className={`${REPORT_TABLE_STYLES.th} min-w-[140px]`}>Account ID</th>
                        <th className={`${REPORT_TABLE_STYLES.th} min-w-[360px]`}>Account Name</th>
                        <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Beginning</th>
                        <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Debit</th>
                        <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Credit</th>
                        <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Ending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a, i) => (
                        <tr key={a.accountId || `${a.accountName}-${i}`} className={REPORT_TABLE_STYLES.tr}>
                          <td className={`${REPORT_TABLE_STYLES.td} tabular-nums`}>{a.accountId || "—"}</td>
                          <td className={REPORT_TABLE_STYLES.tdAccount}>{a.accountName || "—"}</td>
                          <td className={REPORT_TABLE_STYLES.tdNumeric}>{fmt(toNumber(a.beginning))}</td>
                          <td className={REPORT_TABLE_STYLES.tdNumeric}>{fmt(toNumber(a.debit))}</td>
                          <td className={REPORT_TABLE_STYLES.tdNumeric}>{fmt(toNumber(a.credit))}</td>
                          <td className={REPORT_TABLE_STYLES.tdNumeric}>{fmt(toNumber(a.ending))}</td>
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className={`${REPORT_TABLE_STYLES.trTotal} border-t-2`}>
                        <td className={REPORT_TABLE_STYLES.td} colSpan={2}>
                          <span className="font-bold">TOTAL</span>
                        </td>
                        <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalBeginning)}</td>
                        <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalDebit)}</td>
                        <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalCredit)}</td>
                        <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalEnding)}</td>
                      </tr>
                      {/* Balance check row */}
                      <tr className={Math.abs(totals.balance) < 0.01 ? "bg-green-50" : "bg-red-50"}>
                        <td className={REPORT_TABLE_STYLES.td} colSpan={2}>
                          <span className="text-xs font-semibold">
                            Balance Check (Debits - Credits):
                          </span>
                        </td>
                        <td className={REPORT_TABLE_STYLES.td} colSpan={4}>
                          <span className={`text-xs font-bold ${Math.abs(totals.balance) < 0.01 ? "text-green-700" : "text-red-700"}`}>
                            {fmt(totals.balance)} {Math.abs(totals.balance) < 0.01 ? "✅ Balanced" : "⚠️ Not Balanced"}
                          </span>
                        </td>
                      </tr>
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

