"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";

type ColData = { value?: string; id?: string };
type ReportRow = {
  ColData?: ColData[];
  Header?: { ColData?: ColData[] };
  Rows?: { Row?: ReportRow[] };
  type?: string;
};

function getRows(report: any): ReportRow[] {
  return report?.Rows?.Row ?? report?.report?.Rows?.Row ?? [];
}

function getColumns(report: any): string[] {
  const cols = report?.Columns?.Column ?? report?.report?.Columns?.Column ?? [];
  return cols.map((c: any) => c?.ColTitle ?? "").filter((x: string) => x !== "");
}

function AccountInner() {
  const sp = useSearchParams();

  const orgId = sp.get("orgId") ?? "";
  const accountId = sp.get("accountId") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const name = sp.get("name") ?? "Account";

  const [status, setStatus] = useState<string>("");
  const [payload, setPayload] = useState<any>(null);

  async function load() {
    if (!orgId || !accountId || !from || !to) {
      setStatus("Missing orgId/accountId/from/to in the URL.");
      return;
    }

    setStatus("Loading account transactions...");
    setPayload(null);

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE!;
      const url =
        `${base}/qbo/account-transactions?orgId=${encodeURIComponent(orgId)}` +
        `&accountId=${encodeURIComponent(accountId)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}`;

      const resp = await fetch(url, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(JSON.stringify(json));
      setPayload(json);
      setStatus("Loaded ✅");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, accountId, from, to]);

  const report = payload?.report;
  const columns = useMemo(() => getColumns(report), [report]);
  const rows = useMemo(() => getRows(report), [report]);

  // Placeholder handlers (replace with real ones from your actual page if needed)
  const onCreateOrg = () => setStatus("Create org clicked");
  const onLoadCompanyInfo = () => setStatus("Load Company Info clicked");
  const onRunMonthEnd = () => setStatus("Run Month-End clicked");
  const goToPnl = () => {
    if (orgId) {
      window.location.href = `/pnl?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
  };
  const onLoadFindings = () => setStatus("Load Findings clicked");

  // Helper for Connect QuickBooks link
  const qboConnectUrl = (id: string) => `https://app.qbo.intuit.com/app/connect?orgId=${encodeURIComponent(id)}`;

  return (
    <main>
      <TopBar>
        <button className="topbar-btn" onClick={onCreateOrg}>
          Create org
        </button>

        <a
          className="topbar-btn"
          href={orgId ? qboConnectUrl(orgId) : "#"}
          aria-disabled={!orgId}
          onClick={(e) => {
            if (!orgId) {
              e.preventDefault();
              setStatus("Create/select an orgId first.");
            }
          }}
        >
          Connect QuickBooks
        </a>

        <button className="topbar-btn" onClick={onLoadCompanyInfo} disabled={!orgId}>
          Load Company Info
        </button>

        <button className="topbar-btn" onClick={onRunMonthEnd} disabled={!orgId}>
          Run Month-End (QBO)
        </button>

        <button className="topbar-btn" onClick={goToPnl} disabled={!orgId}>
          View Full P&amp;L
        </button>

        <a
          className="topbar-btn"
          href={`/tb?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
          aria-disabled={!orgId}
        >
          Trial Balance
        </a>

        <button className="topbar-btn" onClick={onLoadFindings} disabled={!orgId}>
          Load Findings
        </button>
      </TopBar>

      <div className="container" style={{ paddingTop: 16 }}>
        <div className="card">
          <div style={{ fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12, opacity: 0.65 }}>
            Account Detail
          </div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 750 }}>
            {decodeURIComponent(name)} <span style={{ opacity: 0.6, fontSize: 14 }}>({accountId})</span>
          </div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Period: <b>{from}</b> → <b>{to}</b>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Status</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{status || "—"}</div>
        </div>

        {report && (
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <div style={{ fontWeight: 850 }}>Transactions</div>
                {!!columns.length && (
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    Columns: {columns.join(" • ")}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              {rows.length === 0 ? (
                <div style={{ opacity: 0.75 }}>No rows returned for this report.</div>
              ) : (
                rows.map((r, i) => {
                  const cd = r.ColData ?? r.Header?.ColData ?? [];
                  return (
                    <div
                      key={i}
                      style={{
                        border: "1px solid rgba(15,23,42,0.10)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(255,255,255,0.72)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {cd.map((c, idx) => (
                          <div key={idx} style={{ minWidth: 120, fontVariantNumeric: "tabular-nums" }}>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>{columns[idx] ?? (idx === 0 ? "Item" : `Col ${idx + 1}`)}</div>
                            <div style={{ marginTop: 4 }}>{c?.value ?? "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <AccountInner />
    </Suspense>
  );
}