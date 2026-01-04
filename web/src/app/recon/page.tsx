"use client";

import { useEffect, useMemo, useState } from "react";
import { ui } from "@/components/ui";
import {
  uploadReconStatement,
  listReconStatements,
  listReconLines,
  runReconMatch,
  ignoreReconLine,
  attachReceipt,
  type ReconStatement,
  type ReconStatementLine,
} from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { ReportHeader } from "@/components/ReportHeader";

type Tab = "upload" | "match" | "review";

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const absValue = Math.abs(v);
  const formatted = absValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `(${formatted})` : formatted;
}

export default function ReconPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [status, setStatus] = useState<string>("—");
  const [statements, setStatements] = useState<ReconStatement[]>([]);
  const [lines, setLines] = useState<ReconStatementLine[]>([]);
  const [matchSummary, setMatchSummary] = useState<{
    matchedCount: number;
    ambiguousCount: number;
    unmatchedCount: number;
  } | null>(null);

  // Upload form state
  const [uploadKind, setUploadKind] = useState<"bank" | "credit_card">("bank");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountLast4, setAccountLast4] = useState("");

  // Load statements on mount and when org/period changes
  useEffect(() => {
    if (!orgId) return;
    loadStatements();
  }, [orgId, from, to]);

  // Load lines when switching to review tab
  useEffect(() => {
    if (activeTab === "review" && orgId) {
      loadLines();
    }
  }, [activeTab, orgId]);

  async function loadStatements() {
    if (!orgId) return;
    try {
      setStatus("Loading statements...");
      const result = await listReconStatements(orgId, undefined, from, to);
      if (result.ok) {
        setStatements(result.statements);
        setStatus(`Loaded ${result.statements.length} statement(s) ✅`);
      } else {
        setStatus("Error loading statements");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  async function loadLines() {
    if (!orgId) return;
    try {
      const result = await listReconLines(undefined, "unmatched");
      if (result.ok) {
        setLines(result.lines);
      }
    } catch (e: any) {
      console.error("Error loading lines:", e);
    }
  }

  async function handleUpload() {
    if (!orgId || !from || !to || !uploadFile) {
      setStatus("Missing required fields");
      return;
    }

    try {
      setStatus("Uploading...");
      const result = await uploadReconStatement(
        orgId,
        uploadKind,
        from,
        to,
        uploadFile,
        accountName || undefined,
        accountLast4 || undefined
      );

      if (result.ok) {
        setStatus(`Uploaded ✅ (${result.linesInserted} lines)`);
        setUploadFile(null);
        setAccountName("");
        setAccountLast4("");
        await loadStatements();
      } else {
        setStatus("Upload failed");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  async function handleMatch() {
    if (!orgId || !from || !to) {
      setStatus("Missing org/period");
      return;
    }

    try {
      setStatus("Running matching...");
      const result = await runReconMatch(orgId, uploadKind, from, to);

      if (result.ok) {
        setMatchSummary({
          matchedCount: result.matchedCount,
          ambiguousCount: result.ambiguousCount,
          unmatchedCount: result.unmatchedCount,
        });
        setStatus(`Matching complete ✅`);
        await loadLines();
      } else {
        setStatus("Matching failed");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  async function handleIgnore(lineId: string) {
    try {
      await ignoreReconLine(lineId);
      await loadLines();
    } catch (e: any) {
      console.error("Error ignoring line:", e);
    }
  }

  async function handleToggleReceipt(lineId: string, current: boolean) {
    try {
      await attachReceipt(lineId, !current);
      await loadLines();
    } catch (e: any) {
      console.error("Error updating receipt:", e);
    }
  }

  const unmatchedLines = useMemo(() => {
    return lines.filter((l) => l.match_status === "unmatched" || l.match_status === "ambiguous");
  }, [lines]);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <ReportHeader
          title="Cash & Reconciliation"
          orgLine={`orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`}
          statusText={status || "—"}
        />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {(["upload", "match", "review"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Upload Tab */}
        {activeTab === "upload" && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Upload Statement</div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kind</label>
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value as "bank" | "credit_card")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="bank">Bank</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g., Chase Checking"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last 4 Digits (optional)</label>
                <input
                  type="text"
                  value={accountLast4}
                  onChange={(e) => setAccountLast4(e.target.value)}
                  placeholder="1234"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <button onClick={handleUpload} disabled={!uploadFile} className={ui.btn}>
                Upload
              </button>
            </div>

            {/* Recent statements */}
            {statements.length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-semibold text-slate-900 mb-2">Recent Statements</div>
                <div className="space-y-2">
                  {statements.slice(0, 5).map((stmt) => (
                    <div key={stmt.id} className="text-xs text-slate-600 p-2 bg-slate-50 rounded">
                      {stmt.source_filename} • {stmt.kind} • {stmt.lineCount || 0} lines •{" "}
                      {new Date(stmt.uploaded_at).toLocaleDateString()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Match Tab */}
        {activeTab === "match" && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Run Matching</div>

            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kind to Match</label>
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value as "bank" | "credit_card")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                >
                  <option value="bank">Bank</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>
              <button onClick={handleMatch} disabled={!orgId || !from || !to} className={ui.btn}>
                Run Matching
              </button>
            </div>

            {matchSummary && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-xs text-green-700 font-semibold">Matched</div>
                  <div className="text-2xl font-bold text-green-900">{matchSummary.matchedCount}</div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-xs text-yellow-700 font-semibold">Ambiguous</div>
                  <div className="text-2xl font-bold text-yellow-900">{matchSummary.ambiguousCount}</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-xs text-red-700 font-semibold">Unmatched</div>
                  <div className="text-2xl font-bold text-red-900">{matchSummary.unmatchedCount}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Review Tab */}
        {activeTab === "review" && (
          <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">
              Unmatched Lines ({unmatchedLines.length})
            </div>

            {unmatchedLines.length === 0 ? (
              <div className="text-sm text-slate-600">No unmatched lines</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-center">Receipt</th>
                      <th className="px-4 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedLines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2">{line.posted_date}</td>
                        <td className="px-4 py-2">{line.description}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(line.amount)}</td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              line.match_status === "ambiguous"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {line.match_status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {currentKind === "credit_card" && (
                            <button
                              onClick={() => handleToggleReceipt(line.id, line.has_receipt)}
                              className={`px-2 py-1 rounded text-xs ${
                                line.has_receipt ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {line.has_receipt ? "✓" : "✗"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleIgnore(line.id)}
                            className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Ignore
                          </button>
                        </td>
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

