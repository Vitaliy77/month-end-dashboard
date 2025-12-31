"use client";

import { useEffect, useState } from "react";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import {
  detectAccruals,
  getAccrualCandidates,
  approveAccrual,
  pushAccrualToQbo,
  getAccrualHistory,
  getAccrualRules,
  saveAccrualRules,
  resetAccrualRulesToDefaults,
  type AccrualCandidate,
  type AccrualRule,
} from "@/lib/api";

type Tab = "detect" | "review" | "history" | "rules";

function formatMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatPercent(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function AccrualsPage() {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [activeTab, setActiveTab] = useState<Tab>("detect");
  const [status, setStatus] = useState<string>("");
  const [candidates, setCandidates] = useState<AccrualCandidate[]>([]);
  const [history, setHistory] = useState<AccrualCandidate[]>([]);
  const [rules, setRules] = useState<AccrualRule | null>(null);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load candidates when tab changes or period changes
  useEffect(() => {
    if (activeTab === "review" && orgId && from && to) {
      loadCandidates();
    } else if (activeTab === "history" && orgId) {
      loadHistory();
    } else if (activeTab === "rules" && orgId) {
      loadRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId, from, to]);

  async function handleDetect() {
    if (!orgId || !from || !to) {
      setStatus("Missing orgId/from/to");
      return;
    }

    setLoading(true);
    setStatus("Detecting accrual candidates...");
    try {
      const result = await detectAccruals(orgId, from, to);
      setStatus(`Detected ${result.candidatesCount} candidate(s) ✅`);
      setCandidates(result.candidates);
      setActiveTab("review");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidates() {
    if (!orgId || !from || !to) {
      setStatus("Missing orgId/from/to");
      return;
    }

    setLoading(true);
    setStatus("Loading candidates...");
    try {
      const result = await getAccrualCandidates(orgId, from, to);
      setCandidates(result.candidates);
      setStatus(`Loaded ${result.candidates.length} candidate(s) ✅`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (!orgId) {
      setStatus("Missing orgId");
      return;
    }

    setLoading(true);
    setStatus("Loading history...");
    try {
      const result = await getAccrualHistory(orgId, 50);
      setHistory(result.history);
      setStatus(`Loaded ${result.history.length} history item(s) ✅`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(candidateId: string, decision: "approved" | "rejected") {
    if (!orgId) return;

    setLoading(true);
    try {
      await approveAccrual(candidateId, orgId, decision);
      setStatus(`Candidate ${decision} ✅`);
      await loadCandidates();
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePush(candidateId: string) {
    if (!orgId) return;

    setLoading(true);
    setStatus("Pushing to QBO...");
    try {
      const result = await pushAccrualToQbo(candidateId, orgId);
      if (result.ok && result.journalEntryId) {
        setStatus(`Posted to QBO as Journal Entry ${result.journalEntryId} ✅`);
      } else {
        setStatus(`Error: ${result.error || "Failed to push"}`);
      }
      await loadCandidates();
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadRules() {
    if (!orgId) {
      setStatus("Missing orgId");
      return;
    }

    setLoading(true);
    setStatus("Loading rules...");
    try {
      const result = await getAccrualRules(orgId);
      setRules(result.rules);
      setRulesDirty(false);
      setStatus(`Loaded rules ✅`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRules() {
    if (!orgId || !rules) return;

    setLoading(true);
    setStatus("Saving rules...");
    try {
      const result = await saveAccrualRules(orgId, {
        lookback_months: rules.lookback_months,
        min_amount: rules.min_amount,
        confidence_threshold: rules.confidence_threshold,
        min_recurrence_count: rules.min_recurrence_count,
        excluded_accounts: rules.excluded_accounts,
        excluded_vendors: rules.excluded_vendors,
        include_accounts: rules.include_accounts,
      });
      setRules(result.rules);
      setRulesDirty(false);
      setStatus(`Rules saved ✅`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRules() {
    if (!orgId) return;

    if (!confirm("Reset rules to defaults? This will discard any unsaved changes.")) {
      return;
    }

    setLoading(true);
    setStatus("Resetting rules...");
    try {
      const result = await resetAccrualRulesToDefaults(orgId);
      setRules(result.rules);
      setRulesDirty(false);
      setStatus(`Rules reset to defaults ✅`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function updateRule<K extends keyof AccrualRule>(key: K, value: AccrualRule[K]) {
    if (!rules) return;
    setRules({ ...rules, [key]: value });
    setRulesDirty(true);
  }

  function addToArray(key: "excluded_accounts" | "excluded_vendors" | "include_accounts", value: string) {
    if (!rules || !value.trim()) return;
    const current = rules[key] || [];
    if (!current.includes(value.trim())) {
      updateRule(key, [...current, value.trim()]);
    }
  }

  function removeFromArray(key: "excluded_accounts" | "excluded_vendors" | "include_accounts", index: number) {
    if (!rules) return;
    const current = rules[key] || [];
    updateRule(key, current.filter((_, i) => i !== index));
  }

  const orgLine = orgId && orgName ? `${orgId} • ${orgName}` : orgId || "No org selected";
  const periodLine = from && to ? `Period: ${from} → ${to}` : "No period selected";

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-2">Accruals</h1>
          <div className="text-sm text-slate-600">
            {orgLine} • {periodLine}
          </div>
          {status && (
            <div className="text-sm text-slate-600 mt-1">{status}</div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("detect")}
              className={`px-4 py-2 font-medium ${
                activeTab === "detect"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Detect
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={`px-4 py-2 font-medium ${
                activeTab === "review"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Review ({candidates.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 font-medium ${
                activeTab === "history"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`px-4 py-2 font-medium ${
                activeTab === "rules"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Rules
            </button>
          </div>
        </div>

        {/* Detect Tab */}
        {activeTab === "detect" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Detect Accrual Candidates</h2>
            <p className="text-slate-600 mb-4">
              Analyze the last 6 months of expenses to find recurring vendor/account expenses
              missing in the current period.
            </p>
            <button
              onClick={handleDetect}
              disabled={loading || !orgId || !from || !to}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Detecting..." : "Detect Candidates"}
            </button>
          </div>
        )}

        {/* Review Tab */}
        {activeTab === "review" && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Review Candidates</h2>
                <button
                  onClick={loadCandidates}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>

            {candidates.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No candidates found. Run detection first.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Vendor
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">
                        Confidence
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand) => (
                      <tr key={cand.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{cand.account_name}</div>
                          <div className="text-xs text-slate-500">{cand.account_id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {cand.vendor_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatMoney(cand.expected_amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs ${
                              cand.confidence_score >= 0.8
                                ? "bg-green-100 text-green-800"
                                : cand.confidence_score >= 0.7
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {formatPercent(cand.confidence_score)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs ${
                              cand.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : cand.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {cand.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {cand.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleApprove(cand.id, "approved")}
                                  disabled={loading}
                                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleApprove(cand.id, "rejected")}
                                  disabled={loading}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {cand.status === "approved" && !cand.posting?.journal_entry_id && (
                              <button
                                onClick={() => handlePush(cand.id)}
                                disabled={loading}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                Push to QBO
                              </button>
                            )}
                            {cand.posting?.journal_entry_id && (
                              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                Posted: {cand.posting.journal_entry_id}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">History</h2>
                <button
                  onClick={loadHistory}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No history found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Period
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Account
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                        Journal Entry
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm">
                          {item.period_from_date} → {item.period_to_date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.account_name}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatMoney(item.expected_amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs ${
                              item.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : item.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {item.posting?.journal_entry_id ? (
                            <span className="text-blue-600">{item.posting.journal_entry_id}</span>
                          ) : item.posting?.error_message ? (
                            <span className="text-red-600 text-xs">
                              Error: {item.posting.error_message}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === "rules" && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Accrual Detection Rules</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetRules}
                    disabled={loading}
                    className="px-3 py-1 text-sm bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={handleSaveRules}
                    disabled={loading || !rulesDirty || !orgId}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Saving..." : "Save Rules"}
                  </button>
                </div>
              </div>
            </div>

            {!rules ? (
              <div className="p-6 text-center text-slate-500">
                {loading ? "Loading rules..." : "No rules loaded. Select an org first."}
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Basic Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Lookback Months
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={rules.lookback_months}
                      onChange={(e) => updateRule("lookback_months", parseInt(e.target.value) || 6)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      How many months of history to analyze (default: 6)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Minimum Amount ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rules.min_amount}
                      onChange={(e) => updateRule("min_amount", parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Minimum expense amount to consider (default: $50)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Confidence Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={rules.confidence_threshold}
                      onChange={(e) => updateRule("confidence_threshold", parseFloat(e.target.value) || 0.7)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Minimum confidence score (0.0-1.0, default: 0.7)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Minimum Recurrence Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={rules.min_recurrence_count}
                      onChange={(e) => updateRule("min_recurrence_count", parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Minimum months the expense must appear (default: 3)
                    </p>
                  </div>
                </div>

                {/* Excluded Accounts */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Excluded Account IDs
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Enter account ID to exclude"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addToArray("excluded_accounts", e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        addToArray("excluded_accounts", input.value);
                        input.value = "";
                      }}
                      className="px-3 py-2 bg-slate-100 rounded hover:bg-slate-200"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rules.excluded_accounts.map((id, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-sm"
                      >
                        {id}
                        <button
                          onClick={() => removeFromArray("excluded_accounts", idx)}
                          className="hover:text-red-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {rules.excluded_accounts.length === 0 && (
                      <span className="text-sm text-slate-400">No excluded accounts</span>
                    )}
                  </div>
                </div>

                {/* Excluded Vendors */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Excluded Vendors
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Enter vendor name to exclude"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addToArray("excluded_vendors", e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        addToArray("excluded_vendors", input.value);
                        input.value = "";
                      }}
                      className="px-3 py-2 bg-slate-100 rounded hover:bg-slate-200"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rules.excluded_vendors.map((vendor, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-sm"
                      >
                        {vendor}
                        <button
                          onClick={() => removeFromArray("excluded_vendors", idx)}
                          className="hover:text-red-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {rules.excluded_vendors.length === 0 && (
                      <span className="text-sm text-slate-400">No excluded vendors</span>
                    )}
                  </div>
                </div>

                {/* Include Accounts (Allowlist) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Include Only These Account IDs (Optional)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    If set, only these accounts will be considered. Leave empty to consider all accounts.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Enter account ID to include"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addToArray("include_accounts", e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        addToArray("include_accounts", input.value);
                        input.value = "";
                      }}
                      className="px-3 py-2 bg-slate-100 rounded hover:bg-slate-200"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rules.include_accounts.map((id, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-sm"
                      >
                        {id}
                        <button
                          onClick={() => removeFromArray("include_accounts", idx)}
                          className="hover:text-green-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {rules.include_accounts.length === 0 && (
                      <span className="text-sm text-slate-400">No include filter (all accounts considered)</span>
                    )}
                  </div>
                </div>

                {rulesDirty && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    You have unsaved changes. Click "Save Rules" to persist them.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

