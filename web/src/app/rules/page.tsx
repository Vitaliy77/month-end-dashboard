"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/components/ui";
import {
  createOrg,
  listOrgs,
  qboConnectUrl,
  getRulesForOrg,
  saveRulesForOrg,
  getAccountOwnersForOrg,
  saveAccountOwnersForOrg,
  type Org,
  type Rule,
  type RuleSeverity,
  type AccountOwner,
} from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";

type Tab = "setup" | "rules" | "account-owners";

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// Stable snapshot of rules for comparison (removes derived fields, sorts by id)
function stableRulesSnapshot(rules: Rule[]): string {
  const cleaned = rules
    .map((r) => {
      const { params, ...rest } = r;
      // Remove derived fields from params (like normalizedMode)
      const cleanParams: any = {};
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== "normalizedMode") {
            cleanParams[k] = v;
          }
        }
      }
      return { ...rest, params: cleanParams };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // Stable JSON stringify with sorted keys
  return JSON.stringify(cleaned, Object.keys(cleaned[0] || {}).sort());
}

function toNumberOrString(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  const n = Number(t);
  return Number.isFinite(n) ? n : raw;
}

function safeParseJSON<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    // Guard against extremely large strings that might indicate corruption
    if (s.length > 100000) {
      console.warn("[RulesPage] localStorage value too large, clearing:", s.length);
      return null;
    }
    return JSON.parse(s) as T;
  } catch (e) {
    console.warn("[RulesPage] Failed to parse localStorage:", e);
    return null;
  }
}

// Helper to resolve inherited owner for a rule
function resolveInheritedOwnerForRule(rule: Rule, accountOwners: AccountOwner[]): AccountOwner | null {
  if (!accountOwners || accountOwners.length === 0) return null;
  if (rule.owner_email || rule.owner_name) return null; // Rule has explicit owner

  // Try to match from rule's account selector
  const accountSelector = rule.params?.account_selector;
  const accountNameContains = accountSelector?.account_name_contains;
  const accountNumber = accountSelector?.account_number;

  if (!accountNameContains && !accountNumber) {
    // Try keyword for custom_threshold rules
    const keyword = rule.params?.keyword;
    if (keyword) {
      const match = accountOwners.find(
        (o) =>
          o.enabled &&
          o.account_type === "pnl" &&
          o.account_name_contains &&
          keyword.toLowerCase().includes(o.account_name_contains.toLowerCase())
      );
      if (match) return match;
    }
    return null;
  }

  // Match by account selector
  const match = accountOwners.find((o) => {
    if (!o.enabled) return false;
    if (o.account_type !== "pnl") return false; // Most rules are P&L
    if (accountNumber && o.account_number && o.account_number === accountNumber) return true;
    if (
      accountNameContains &&
      o.account_name_contains &&
      accountNameContains.toLowerCase().includes(o.account_name_contains.toLowerCase())
    )
      return true;
    return false;
  });

  return match || null;
}

export default function RulesPage() {
  const { state, setState } = useOrgPeriod();
  const {
    orgId = "",
    orgName = "",
    from = "2025-12-01",
    to = "2025-12-31",
  } = state;

  const [activeTab, setActiveTab] = useState<Tab>("rules");
  const [status, setStatus] = useState<string>("");

  // Local state for new org name input (not shared)
  const [newOrgName, setNewOrgName] = useState("Test Org");

  // ---- Data ----
  const [orgs, setOrgs] = useState<Org[]>([]);

  const hasOrgId = useMemo(() => Boolean(orgId && orgId.trim().length > 0), [orgId]);

  // ---- Rules (persisted per org via API; local fallback) ----
  const [rules, setRules] = useState<Rule[]>([]);
  const savedRulesRef = useRef<Rule[] | null>(null);
  const [rulesSource, setRulesSource] = useState<"api" | "local" | "default">("default");
  const [rulesSaving, setRulesSaving] = useState(false);

  const RULES_STORAGE_KEY = useMemo(() => `mec_rules_${orgId || "no_org"}`, [orgId]);
  const lastSavedHashRef = useRef<string>("");
  const rulesFingerprint = useMemo(() => stableRulesSnapshot(rules ?? []), [rules]);
  const rulesDirty = useMemo(() => {
    try {
      const currentHash = stableRulesSnapshot(rules ?? []);
      return currentHash !== lastSavedHashRef.current;
    } catch {
      return false;
    }
  }, [rulesFingerprint]);

  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleThreshold, setNewRuleThreshold] = useState<string>("100");
  const [newRuleMode, setNewRuleMode] = useState<"sum" | "any">("sum");
  const [newRuleSeverity, setNewRuleSeverity] = useState<RuleSeverity>("low");

  // Variance rule state
  const [newVarianceRuleName, setNewVarianceRuleName] = useState("");
  const [newVarianceAccountName, setNewVarianceAccountName] = useState("");
  const [newVarianceAbsThreshold, setNewVarianceAbsThreshold] = useState<string>("");
  const [newVariancePctThreshold, setNewVariancePctThreshold] = useState<string>("");
  const [newVarianceMinBase, setNewVarianceMinBase] = useState<string>("");
  const [newVarianceDirection, setNewVarianceDirection] = useState<"any" | "increase" | "decrease">("any");
  const [newVarianceSeverity, setNewVarianceSeverity] = useState<RuleSeverity>("medium");

  // Owner filter
  const [ownerFilterEmail, setOwnerFilterEmail] = useState<string>("");

  // ---- Account Owners ----
  const [accountOwners, setAccountOwners] = useState<AccountOwner[]>([]);
  const [accountOwnersLoading, setAccountOwnersLoading] = useState<boolean>(false);
  const [accountOwnersError, setAccountOwnersError] = useState<string>("");
  const [accountOwnersSaving, setAccountOwnersSaving] = useState(false);
  const [newOwner, setNewOwner] = useState<Partial<AccountOwner>>({
    account_type: "pnl",
    enabled: true,
  });

  const smallInputCls =
    "h-10 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-200";

  // ---- Load existing orgs ----
  useEffect(() => {
    (async () => {
      try {
        const resp = await listOrgs();
        if (process.env.NODE_ENV === "development") {
          console.log("[RulesPage] listOrgs resp", resp);
        }
        if (resp.ok && Array.isArray(resp.orgs)) {
          setOrgs(asArray<Org>(resp.orgs));
        } else {
          console.warn("[RulesPage] listOrgs returned non-ok or invalid orgs:", resp);
          setOrgs([]);
        }
      } catch (e: any) {
        console.error("[RulesPage] Failed to load orgs:", e);
        setOrgs([]);
      }
    })();
  }, []);

  // ---- Load account owners when org changes ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasOrgId) {
        if (!cancelled) setAccountOwners([]);
        return;
      }
      if (!cancelled) {
        setAccountOwnersLoading(true);
        setAccountOwnersError("");
      }
      try {
        const r = await getAccountOwnersForOrg(orgId);
        if (!cancelled) {
          setAccountOwners(asArray<AccountOwner>(r?.owners ?? []));
        }
      } catch (e: any) {
        console.error("Failed to load account owners:", e);
        if (!cancelled) {
          setAccountOwnersError(e?.message || String(e));
          setAccountOwners([]);
        }
      } finally {
        if (!cancelled) {
          setAccountOwnersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, hasOrgId]);

  // ---- Load rules when org changes (API -> localStorage -> default) ----
  useEffect(() => {
    (async () => {
      if (!hasOrgId) {
        setRules([]);
        savedRulesRef.current = [];
        setRulesSource("default");
        return;
      }
      // 1) API
      try {
        const r = await getRulesForOrg(orgId);
        const list = asArray<Rule>(r?.rules);
        setRules(list);
        savedRulesRef.current = list;
        lastSavedHashRef.current = stableRulesSnapshot(list);
        setRulesSource("api");
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(list));
        return;
      } catch {
        // fall through
      }
      // 2) local fallback
      const saved = safeParseJSON<Rule[]>(localStorage.getItem(RULES_STORAGE_KEY));
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setRules(saved);
        savedRulesRef.current = saved;
        lastSavedHashRef.current = stableRulesSnapshot(saved);
        setRulesSource("local");
        return;
      } else {
        // If parsing failed, clear corrupted localStorage entry
        try {
          const raw = localStorage.getItem(RULES_STORAGE_KEY);
          if (raw && (raw.length > 100000 || !raw.trim().startsWith("["))) {
            console.warn("[RulesPage] Clearing corrupted rules localStorage");
            localStorage.removeItem(RULES_STORAGE_KEY);
          }
        } catch {
          // Ignore errors during cleanup
        }
      }
      // 3) empty means "use backend defaults"
      setRules([]);
      savedRulesRef.current = [];
      lastSavedHashRef.current = stableRulesSnapshot([]);
      setRulesSource("default");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, hasOrgId]);

  async function onCreateOrg() {
    try {
      setStatus("Creating org...");
      const r: any = await createOrg({ name: newOrgName });
      const newOrgId = r?.orgId || r?.id;
      if (!newOrgId) throw new Error("createOrg did not return orgId");

      // Update global state
      setState({ orgId: newOrgId, orgName: newOrgName });

      setStatus(`Org created ✅ (${newOrgId})`);
      try {
        const rr = await listOrgs();
        if (rr.ok && Array.isArray(rr.orgs)) {
          setOrgs(asArray<Org>(rr.orgs));
        }
      } catch {
        // ignore
      }
    } catch (e: any) {
      setStatus(`Create org failed: ${e?.message || String(e)}`);
    }
  }

  async function onSaveRules() {
    if (!hasOrgId) {
      setStatus("Please select an org first.");
      return;
    }
    try {
      setRulesSaving(true);
      const result = await saveRulesForOrg(orgId, rules);
      // Update saved ref to clear dirty state
      savedRulesRef.current = rules;
      lastSavedHashRef.current = stableRulesSnapshot(rules);
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
      setRulesSource("api");
      setStatus(`Rules saved ✅ (${result?.rulesSaved ?? rules.length} rule(s))`);
    } catch (e: any) {
      setStatus(`Save rules failed: ${e?.message || String(e)}`);
    } finally {
      setRulesSaving(false);
    }
  }

  function onDiscardRuleChanges() {
    const saved = savedRulesRef.current ?? [];
    setRules(saved);
    setStatus("Rule changes discarded ✅");
  }

  async function onResetRules() {
    setRules([]);
    savedRulesRef.current = [];
    localStorage.removeItem(RULES_STORAGE_KEY);
    if (hasOrgId) {
      try {
        setRulesSaving(true);
        await saveRulesForOrg(orgId, []);
        setRulesSource("api");
      } catch {
        // non-fatal
      } finally {
        setRulesSaving(false);
      }
    }
    setStatus("Rules reset ✅ (backend defaults will apply)");
  }

  function addRule() {
    const name = newRuleName.trim();
    const keyword = newRuleKeyword.trim();
    const threshold = Number(String(newRuleThreshold).trim());
    if (!name) {
      setStatus("Rule name is required.");
      return;
    }
    if (!keyword) {
      setStatus("Keyword is required.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
      setStatus("Threshold must be a positive number.");
      return;
    }
    const id = `custom_${hashStr(`${name}|${keyword}|${Date.now()}`)}`;
    const normalizedMode = newRuleMode === "any" ? "any" : "sum";
    const rule: Rule = {
      id,
      name,
      enabled: true,
      severity: newRuleSeverity,
      type: "custom_threshold",
      params: { keyword, threshold, mode: normalizedMode, normalizedMode },
    };
    setRules((prev) => [rule, ...(prev ?? [])]);
    setNewRuleName("");
    setNewRuleKeyword("");
    setNewRuleThreshold("100");
    setNewRuleMode("sum");
    setNewRuleSeverity("low");
    setStatus("Rule added (not saved yet).");
  }

  function addVarianceRule() {
    const name = newVarianceRuleName.trim();
    const accountName = newVarianceAccountName.trim();
    // absThreshold: if blank, store undefined (not 0)
    const absThresholdRaw = newVarianceAbsThreshold.trim();
    const absThreshold = absThresholdRaw ? Number(absThresholdRaw) : NaN;
    const pctThreshold = newVariancePctThreshold.trim()
      ? Number(newVariancePctThreshold.trim()) / 100
      : NaN; // Convert percentage to decimal
    const minBase = newVarianceMinBase.trim() ? Number(newVarianceMinBase.trim()) : 0;

    if (!name) {
      setStatus("Rule name is required.");
      return;
    }
    // Account name is now optional (blank = global rule, matches all accounts)
    if (!Number.isFinite(absThreshold) && !Number.isFinite(pctThreshold)) {
      setStatus("At least one threshold (absolute or percent) is required.");
      return;
    }

    const id = `variance_${hashStr(`${name}|${accountName || "global"}|${Date.now()}`)}`;
    const params: any = {
      metric: "pnl",
      direction: newVarianceDirection,
    };
    
    // Only include account_selector if accountName is provided (for global rules, omit it)
    if (accountName) {
      params.account_selector = {
        account_name_contains: accountName,
      };
    }
    
    // Only store abs_threshold if it's a valid number (not NaN/undefined)
    if (Number.isFinite(absThreshold)) {
      params.abs_threshold = absThreshold;
    }
    
    if (Number.isFinite(pctThreshold)) {
      params.pct_threshold = pctThreshold;
    }
    
    if (minBase > 0) {
      params.min_base_amount = minBase;
    }

    const rule: Rule = {
      id,
      name,
      enabled: true,
      severity: newVarianceSeverity,
      type: "variance_prior_month",
      params,
    };
    setRules((prev) => [rule, ...(prev ?? [])]);
    setNewVarianceRuleName("");
    setNewVarianceAccountName("");
    setNewVarianceAbsThreshold("");
    setNewVariancePctThreshold("");
    setNewVarianceMinBase("");
    setNewVarianceDirection("any");
    setNewVarianceSeverity("medium");
    setStatus("Variance rule added (not saved yet).");
  }

  function setRuleEnabled(id: string, enabled: boolean) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }

  function setRuleSeverity(id: string, severity: RuleSeverity) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, severity } : r)));
  }

  function setRuleParam(id: string, key: string, value: any) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, params: { ...(r.params || {}), [key]: value } } : r))
    );
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  // Account Owners functions
  async function onSaveAccountOwners() {
    if (!hasOrgId) {
      setStatus("Please select an org first.");
      return;
    }
    setAccountOwnersSaving(true);
    setAccountOwnersError("");
    try {
      // Clean and validate owners before save
      const owners = accountOwners.map((o) => ({
        ...o,
        owner_email: (o.owner_email ?? "").trim().toLowerCase(),
        owner_name: (o.owner_name ?? "").trim(),
        owner_role: (o.owner_role ?? "").trim() || undefined,
        notes: (o.notes ?? "").trim() || undefined,
        account_number: (o.account_number ?? "").trim() || undefined,
        account_name_contains: (o.account_name_contains ?? "").trim() || undefined,
      }));

      const r = await saveAccountOwnersForOrg(orgId, owners);
      if (r?.ok) {
        // Refresh from API to confirm persisted + normalize
        const refreshed = await getAccountOwnersForOrg(orgId);
        setAccountOwners(asArray<AccountOwner>(refreshed?.owners ?? []));
        setStatus(`Account owners saved ✅ (${owners.length} owner(s))`);
      } else {
        throw new Error("Save failed: API returned ok=false");
      }
    } catch (e: any) {
      console.error("Save account owners failed:", e);
      setAccountOwnersError(e?.message || String(e));
      setStatus(`Save account owners failed: ${e?.message || String(e)}`);
    } finally {
      setAccountOwnersSaving(false);
    }
  }

  function addAccountOwner() {
    const owner: AccountOwner = {
      id: `owner_${hashStr(`${Date.now()}|${Math.random()}`)}`,
      org_id: orgId,
      account_type: (newOwner.account_type || "pnl") as "tb" | "pnl" | "bs",
      account_number: newOwner.account_number?.trim() || undefined,
      account_name_contains: newOwner.account_name_contains?.trim() || undefined,
      owner_name: newOwner.owner_name?.trim() || "",
      owner_email: newOwner.owner_email?.trim() || "",
      owner_role: newOwner.owner_role?.trim() || undefined,
      notes: newOwner.notes?.trim() || undefined,
      enabled: newOwner.enabled !== false,
    };

    if (!owner.owner_name && !owner.owner_email) {
      setStatus("Owner name or email is required.");
      return;
    }
    if (!owner.account_number && !owner.account_name_contains) {
      setStatus("Account number or account name contains is required.");
      return;
    }

    setAccountOwners((prev) => [...prev, owner]);
    setNewOwner({ account_type: "pnl", enabled: true });
    setStatus("Account owner added (not saved yet).");
  }

  function deleteAccountOwner(id: string) {
    setAccountOwners((prev) => prev.filter((o) => o.id !== id));
    setStatus("Account owner removed (not saved yet).");
  }

  const orgLine = orgId && orgName ? `${orgId} • ${orgName}` : orgId || "No org selected";
  const periodLine = from && to ? `Period: ${from} → ${to}` : "No period selected";

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-2">Rules</h1>
          <div className="text-sm text-slate-600">
            {orgLine} • {periodLine}
          </div>
          {status && <div className="text-sm text-slate-600 mt-1">{status}</div>}
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("setup")}
              className={`px-4 py-2 font-medium ${
                activeTab === "setup"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Setup
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
            <button
              onClick={() => setActiveTab("account-owners")}
              className={`px-4 py-2 font-medium ${
                activeTab === "account-owners"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Account Ownership
            </button>
          </div>
        </div>

        {/* Setup Tab */}
        {activeTab === "setup" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-6">
              <div className="text-xs font-extrabold uppercase tracking-[.18em] text-slate-500 mb-4">
                Organization Setup
              </div>

              {/* Org Selection */}
              <div className="mb-4">
                <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500 mb-2">
                  Select Organization
                </div>
                <select
                  className={smallInputCls}
                  value={orgId}
                  onChange={(e) => {
                    const selected = orgs.find((o) => o.id === e.target.value);
                    setState({
                      orgId: e.target.value,
                      orgName: selected?.name || "",
                    });
                  }}
                >
                  <option value="">— Select org —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name || o.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Create New Org */}
              <div className="mb-4">
                <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500 mb-2">
                  Create New Organization
                </div>
                <div className="flex gap-2">
                  <input
                    className={smallInputCls}
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Org name"
                  />
                  <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={onCreateOrg}>
                    Create
                  </button>
                </div>
              </div>

              {/* QBO Connect */}
              {hasOrgId && (
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500 mb-2">
                    QuickBooks Online
                  </div>
                  <a
                    href={qboConnectUrl(orgId)}
                    target="_blank"
                    rel="noreferrer"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                  >
                    Connect QBO
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === "rules" && (
          <div className="space-y-4">
            {/* Rules Header */}
            <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                    Rules
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Source:{" "}
                    <span className="font-semibold text-slate-900">
                      {rulesSource === "api"
                        ? "Saved (API)"
                        : rulesSource === "local"
                        ? "Local fallback"
                        : "Defaults"}
                    </span>
                    {rulesDirty && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                        Unsaved changes
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className={`${ui.btn} ${ui.btnGhost}`}
                    onClick={onResetRules}
                    title="Reset (backend defaults apply)"
                  >
                    Reset
                  </button>
                  <button
                    className={`${ui.btn} ${ui.btnGhost}`}
                    onClick={onDiscardRuleChanges}
                    disabled={!rulesDirty}
                    title={!rulesDirty ? "No changes to discard" : "Discard unsaved changes"}
                  >
                    Discard
                  </button>
                  <button
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    onClick={onSaveRules}
                    disabled={!rulesDirty || rulesSaving || !hasOrgId}
                    title={!hasOrgId ? "Select org first" : !rulesDirty ? "No changes" : "Save rules"}
                  >
                    {rulesSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500 mb-2">
                  Filter rules
                </div>
                <input
                  className={smallInputCls}
                  type="email"
                  placeholder="Filter by owner email (e.g., your@email.com)"
                  value={ownerFilterEmail}
                  onChange={(e) => setOwnerFilterEmail(e.target.value.trim().toLowerCase())}
                />
                <div className="mt-1 text-xs text-slate-500">
                  Enter email to show only rules assigned to that owner
                </div>
              </div>
            </div>

            {/* Add rule */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                Add rule (basic)
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Name</div>
                  <input
                    className={smallInputCls}
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="e.g., Materials over $500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Keyword</div>
                    <input
                      className={smallInputCls}
                      value={newRuleKeyword}
                      onChange={(e) => setNewRuleKeyword(e.target.value)}
                      placeholder="e.g., materials"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Threshold</div>
                    <input
                      className={smallInputCls}
                      value={newRuleThreshold}
                      onChange={(e) => setNewRuleThreshold(e.target.value)}
                      inputMode="decimal"
                      placeholder="100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Mode</div>
                    <select
                      className={smallInputCls}
                      value={newRuleMode}
                      onChange={(e) => setNewRuleMode(e.target.value as any)}
                    >
                      <option value="sum">Sum (total)</option>
                      <option value="any">Any (single line)</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Severity</div>
                    <select
                      className={smallInputCls}
                      value={newRuleSeverity}
                      onChange={(e) => setNewRuleSeverity(e.target.value as any)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="warn">Warn</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>
                <button className={`${ui.btn} ${ui.btnPrimary} w-full`} onClick={addRule}>
                  Add rule
                </button>
              </div>
            </div>

            {/* Add variance rule */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                Add variance rule (vs prior month)
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Name</div>
                  <input
                    className={smallInputCls}
                    value={newVarianceRuleName}
                    onChange={(e) => setNewVarianceRuleName(e.target.value)}
                    placeholder="e.g., Materials variance > 10%"
                  />
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                    Account Name Contains (optional)
                  </div>
                  <input
                    className={smallInputCls}
                    value={newVarianceAccountName}
                    onChange={(e) => setNewVarianceAccountName(e.target.value)}
                    placeholder="Leave blank for global rule (all accounts)"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    Leave blank to match all accounts. Enter text to match specific accounts.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Abs Threshold ($)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newVarianceAbsThreshold}
                      onChange={(e) => setNewVarianceAbsThreshold(e.target.value)}
                      inputMode="decimal"
                      placeholder="Optional (leave blank)"
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Optional. If blank, only percent threshold is used when prior ≠ 0.
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Pct Threshold (%)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newVariancePctThreshold}
                      onChange={(e) => setNewVariancePctThreshold(e.target.value)}
                      inputMode="decimal"
                      placeholder="e.g., 10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Min Base Amount ($)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newVarianceMinBase}
                      onChange={(e) => setNewVarianceMinBase(e.target.value)}
                      inputMode="decimal"
                      placeholder="e.g., 500"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Direction</div>
                    <select
                      className={smallInputCls}
                      value={newVarianceDirection}
                      onChange={(e) => setNewVarianceDirection(e.target.value as any)}
                    >
                      <option value="any">Any</option>
                      <option value="increase">Increase only</option>
                      <option value="decrease">Decrease only</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Severity</div>
                  <select
                    className={smallInputCls}
                    value={newVarianceSeverity}
                    onChange={(e) => setNewVarianceSeverity(e.target.value as any)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="warn">Warn</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <button className={`${ui.btn} ${ui.btnPrimary} w-full`} onClick={addVarianceRule}>
                  Add variance rule
                </button>
              </div>
            </div>

            {/* Rules list */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="divide-y divide-slate-200">
                {(() => {
                  const filteredRules = ownerFilterEmail
                    ? (rules || []).filter(
                        (r) =>
                          r.owner_email?.toLowerCase().includes(ownerFilterEmail) ||
                          r.owner_name?.toLowerCase().includes(ownerFilterEmail)
                      )
                    : rules || [];
                  return filteredRules.length === 0 ? (
                    <div className="p-4 text-sm text-slate-600">
                      {ownerFilterEmail
                        ? `No rules found for owner "${ownerFilterEmail}"`
                        : "No custom rules loaded here. Backend defaults will still run."}
                    </div>
                  ) : (
                    filteredRules.map((r) => {
                      const inheritedOwner = resolveInheritedOwnerForRule(r, accountOwners);
                      const displayOwner = r.owner_name || r.owner_email ? r : inheritedOwner;
                      return (
                        <div key={r.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-900 truncate">{r.name}</div>
                              <div className="mt-1 text-xs text-slate-600">
                                <span className="font-bold">id:</span> {r.id}
                              </div>
                              {r.description && <div className="mt-1 text-sm text-slate-700">{r.description}</div>}
                              {/* Owner fields */}
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-slate-500">Owner:</span>{" "}
                                  <span className="font-semibold text-slate-900">
                                    {displayOwner?.owner_name || displayOwner?.owner_email || "(none)"}
                                  </span>
                                  {displayOwner?.owner_email && (
                                    <a
                                      href={`mailto:${displayOwner.owner_email}`}
                                      className="ml-1 text-blue-600 hover:underline"
                                      title={`Contact ${displayOwner.owner_name || displayOwner.owner_email}`}
                                    >
                                      📧
                                    </a>
                                  )}
                                  {inheritedOwner && !r.owner_name && !r.owner_email && (
                                    <span className="ml-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-900">
                                      From Account Ownership
                                    </span>
                                  )}
                                </div>
                                {(displayOwner?.owner_role || r.owner_role) && (
                                  <div>
                                    <span className="text-slate-500">Role:</span>{" "}
                                    <span className="font-semibold text-slate-900">
                                      {displayOwner?.owner_role || r.owner_role}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-sm"
                                value={(r.severity || "low") as any}
                                onChange={(e) => setRuleSeverity(r.id, e.target.value as RuleSeverity)}
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="warn">Warn</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                                <option value="info">Info</option>
                              </select>
                              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={r.enabled !== false}
                                  onChange={(e) => setRuleEnabled(r.id, e.target.checked)}
                                />
                                Enabled
                              </label>
                            </div>
                          </div>
                          {/* Owner fields editor */}
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                            <div>
                              <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                Owner Name
                              </div>
                              <input
                                className={smallInputCls}
                                value={r.owner_name || ""}
                                onChange={(e) => {
                                  setRules((prev) =>
                                    prev.map((rule) =>
                                      rule.id === r.id ? { ...rule, owner_name: e.target.value } : rule
                                    )
                                  );
                                }}
                                placeholder="e.g., John Doe"
                              />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                Owner Email
                              </div>
                              <input
                                className={smallInputCls}
                                type="email"
                                value={r.owner_email || ""}
                                onChange={(e) => {
                                  setRules((prev) =>
                                    prev.map((rule) =>
                                      rule.id === r.id ? { ...rule, owner_email: e.target.value } : rule
                                    )
                                  );
                                }}
                                placeholder="e.g., john@example.com"
                              />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                Owner Role
                              </div>
                              <input
                                className={smallInputCls}
                                value={r.owner_role || ""}
                                onChange={(e) => {
                                  setRules((prev) =>
                                    prev.map((rule) =>
                                      rule.id === r.id ? { ...rule, owner_role: e.target.value } : rule
                                    )
                                  );
                                }}
                                placeholder="e.g., Controller, AP, Payroll"
                              />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                Owner Notes
                              </div>
                              <input
                                className={smallInputCls}
                                value={r.owner_notes || ""}
                                onChange={(e) => {
                                  setRules((prev) =>
                                    prev.map((rule) =>
                                      rule.id === r.id ? { ...rule, owner_notes: e.target.value } : rule
                                    )
                                  );
                                }}
                                placeholder="Optional notes"
                              />
                            </div>
                          </div>
                          {r.params && Object.keys(r.params).length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              {Object.entries(r.params).map(([k, v]) => {
                                // Handle account_selector specially
                                if (k === "account_selector" && typeof v === "object" && v !== null) {
                                  const selector = v as any;
                                  return (
                                    <div key={k} className="col-span-2">
                                      <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                        Account Selector
                                      </div>
                                      <div className="mt-1 text-sm text-slate-700 space-y-1">
                                        {selector.account_name_contains && (
                                          <div>
                                            <span className="text-slate-500">Name contains:</span>{" "}
                                            <span className="font-semibold">{String(selector.account_name_contains)}</span>
                                          </div>
                                        )}
                                        {selector.account_number && (
                                          <div>
                                            <span className="text-slate-500">Account #:</span>{" "}
                                            <span className="font-semibold">{String(selector.account_number)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={k}>
                                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                                      {k}
                                    </div>
                                    <input
                                      className={smallInputCls}
                                      value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                                      onChange={(e) => {
                                        const next = toNumberOrString(e.target.value);
                                        setRuleParam(r.id, k, next);
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="mt-3 flex justify-end">
                            <button className={`${ui.btn} ${ui.btnGhost}`} onClick={() => deleteRule(r.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Account Ownership tab */}
        {activeTab === "account-owners" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                    Account Ownership
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Assign owners to accounts. Rules will inherit owners unless explicitly set.
                  </div>
                </div>
                <button
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  onClick={onSaveAccountOwners}
                  disabled={accountOwnersSaving || !hasOrgId}
                  title={!hasOrgId ? "Select org first" : "Save account owners"}
                >
                  {accountOwnersSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Add account owner */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                Add Account Owner
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Account Type</div>
                    <select
                      className={smallInputCls}
                      value={newOwner.account_type || "pnl"}
                      onChange={(e) =>
                        setNewOwner({ ...newOwner, account_type: e.target.value as "tb" | "pnl" | "bs" })
                      }
                    >
                      <option value="tb">Trial Balance</option>
                      <option value="pnl">P&L</option>
                      <option value="bs">Balance Sheet</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Account Number (optional)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newOwner.account_number || ""}
                      onChange={(e) => setNewOwner({ ...newOwner, account_number: e.target.value })}
                      placeholder="e.g., 4000"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                    Account Name Contains (optional)
                  </div>
                  <input
                    className={smallInputCls}
                    value={newOwner.account_name_contains || ""}
                    onChange={(e) => setNewOwner({ ...newOwner, account_name_contains: e.target.value })}
                    placeholder="e.g., Product Income"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Owner Name</div>
                    <input
                      className={smallInputCls}
                      value={newOwner.owner_name || ""}
                      onChange={(e) => setNewOwner({ ...newOwner, owner_name: e.target.value })}
                      placeholder="e.g., John Doe"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">Owner Email</div>
                    <input
                      className={smallInputCls}
                      type="email"
                      value={newOwner.owner_email || ""}
                      onChange={(e) => setNewOwner({ ...newOwner, owner_email: e.target.value })}
                      placeholder="e.g., john@example.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Owner Role (optional)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newOwner.owner_role || ""}
                      onChange={(e) => setNewOwner({ ...newOwner, owner_role: e.target.value })}
                      placeholder="e.g., Controller"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[.12em] text-slate-500">
                      Notes (optional)
                    </div>
                    <input
                      className={smallInputCls}
                      value={newOwner.notes || ""}
                      onChange={(e) => setNewOwner({ ...newOwner, notes: e.target.value })}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={newOwner.enabled !== false}
                    onChange={(e) => setNewOwner({ ...newOwner, enabled: e.target.checked })}
                  />
                  <label className="text-sm text-slate-700">Enabled</label>
                </div>
                <button className={`${ui.btn} ${ui.btnPrimary} w-full`} onClick={addAccountOwner}>
                  Add Account Owner
                </button>
              </div>
            </div>

            {/* Account owners list */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                Account Owners ({accountOwners.length})
              </div>
              {accountOwnersLoading ? (
                <div className="mt-3 text-sm text-slate-600">Loading...</div>
              ) : accountOwnersError ? (
                <div className="mt-3 text-sm text-red-600">Error: {accountOwnersError}</div>
              ) : accountOwners.length === 0 ? (
                <div className="mt-3 text-sm text-slate-600">No account owners yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {accountOwners.map((o) => (
                    <div key={o.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {o.owner_name || o.owner_email || "(unnamed)"}
                          </div>
                          {o.owner_email && (
                            <a
                              href={`mailto:${o.owner_email}`}
                              className="mt-1 text-xs text-blue-600 hover:underline"
                            >
                              {o.owner_email}
                            </a>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500">Type:</span>{" "}
                              <span className="font-semibold text-slate-900 uppercase">{o.account_type}</span>
                            </div>
                            {o.account_number && (
                              <div>
                                <span className="text-slate-500">Account #:</span>{" "}
                                <span className="font-semibold text-slate-900">{o.account_number}</span>
                              </div>
                            )}
                            {o.account_name_contains && (
                              <div className="col-span-2">
                                <span className="text-slate-500">Name contains:</span>{" "}
                                <span className="font-semibold text-slate-900">{o.account_name_contains}</span>
                              </div>
                            )}
                            {o.owner_role && (
                              <div>
                                <span className="text-slate-500">Role:</span>{" "}
                                <span className="font-semibold text-slate-900">{o.owner_role}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-slate-500">Status:</span>{" "}
                              <span
                                className={`font-semibold ${o.enabled ? "text-green-700" : "text-slate-500"}`}
                              >
                                {o.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </div>
                          {o.notes && (
                            <div className="mt-2 text-xs text-slate-600">
                              <span className="text-slate-500">Notes:</span> {o.notes}
                            </div>
                          )}
                        </div>
                        <button
                          className={`${ui.btn} ${ui.btnGhost} text-red-600`}
                          onClick={() => deleteAccountOwner(o.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

