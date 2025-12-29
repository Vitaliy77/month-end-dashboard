// api/src/ruleEngine.ts
import type { Rule } from "./rulesStore.js";
import type { AccountOwner, AccountForMatching } from "./accountOwnersStore.js";
import { resolveOwnerForAccount } from "./accountOwnersStore.js";

export const RULE_ENGINE_VERSION = "2025-12-24T-TEST-1";
console.log("[ruleEngine] loaded version:", RULE_ENGINE_VERSION);

// Helpers for QBO report JSON (P&L / TB)
function toNumber(v: any): number | null {
  if (v == null) return null;
  const s0 = String(v).trim();
  if (!s0) return null;

  // QBO can represent negatives as "(123.45)" and also include "$" and commas.
  const negByParens = /^\(.*\)$/.test(s0);
  const s = s0.replace(/[(),$]/g, "").replace(/,/g, "").trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negByParens ? -n : n;
}

type QboRow = {
  type?: string;
  group?: string;
  ColData?: { value?: string; id?: string }[];
  Header?: { ColData?: { value?: string; id?: string }[] };
  Summary?: { ColData?: { value?: string; id?: string }[] };
  Rows?: { Row?: QboRow[] };
};

function rowLabel(r: QboRow): string {
  // Prefer Header label if present; otherwise row ColData.
  const cd = r.Header?.ColData || r.ColData || [];
  return (cd?.[0]?.value || "").trim();
}

function rowAmount(r: QboRow): number | null {
  const cd = r.ColData || r.Summary?.ColData || [];
  if (!cd.length) return null;

  // Prefer the last numeric value in the row (often the Total),
  // especially when summarize_column_by=Month creates multiple columns.
  for (let i = cd.length - 1; i >= 0; i--) {
    const n = toNumber(cd[i]?.value);
    if (n != null) return n;
  }

  // Fallback: many reports store amount in column index 1
  const fallback = toNumber(cd?.[1]?.value);
  return fallback != null ? fallback : null;
}

function flattenRows(
  rows: QboRow[],
  path: string[] = []
): { path: string[]; row: QboRow; label: string }[] {
  const out: { path: string[]; row: QboRow; label: string }[] = [];
  for (const r of rows || []) {
    const label = rowLabel(r) || r.group || r.type || "row";
    const nextPath = [...path, label];
    out.push({ path: nextPath, row: r, label });
    const kids = r.Rows?.Row || [];
    if (kids.length) out.push(...flattenRows(kids, nextPath));
  }
  return out;
}

// Small stable hash (for deterministic finding ids)
function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export type FindingOut = {
  id: string;
  title: string;
  severity: string;
  summary: string;
  detail: string;
  ruleId: string;
  ruleName: string;
  paramsUsed: any;
  evidence: any;
  qbo_link?: string;
  // Variance-specific fields (for variance_prior_month rule type)
  current_value?: number;
  prior_value?: number;
  delta?: number;
  pct_delta?: number;
  // Owner fields (can come from rule or account ownership)
  owner_name?: string;
  owner_email?: string;
  owner_role?: string;
  owner_source?: "rule" | "account" | "none";
};

function makeFindingId(ruleId: string, evidence: any) {
  const blob = JSON.stringify(evidence ?? {});
  return `${ruleId}:${hashString(blob)}`;
}

// Generic matcher helpers
function norm(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

function safeNum(v: any, fallback: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

// Helper to resolve owner for a finding based on rule and account
function resolveFindingOwner(
  rule: Rule,
  accountForMatching: AccountForMatching | null,
  accountOwners: AccountOwner[]
): {
  owner_name?: string;
  owner_email?: string;
  owner_role?: string;
  owner_source: "rule" | "account" | "none";
} {
  // Priority 1: Rule has explicit owner
  if (rule.owner_email || rule.owner_name) {
    return {
      owner_name: rule.owner_name,
      owner_email: rule.owner_email,
      owner_role: rule.owner_role,
      owner_source: "rule",
    };
  }

  // Priority 2: Resolve from account ownership
  if (accountForMatching && accountOwners.length > 0) {
    const accountOwner = resolveOwnerForAccount(accountOwners, accountForMatching);
    if (accountOwner) {
      return {
        owner_name: accountOwner.owner_name,
        owner_email: accountOwner.owner_email,
        owner_role: accountOwner.owner_role,
        owner_source: "account",
      };
    }
  }

  return { owner_source: "none" };
}

export function evaluateRules(args: {
  rules: Rule[];
  pnl: any; // QBO P&L report JSON
  pnlPrior?: any; // QBO P&L report JSON for prior month (optional)
  tb?: any; // QBO TB report JSON (optional)
  reportUrl?: string;
  from?: string; // Current period start date
  to?: string; // Current period end date
  accountOwners?: AccountOwner[]; // Account ownership mappings (optional)
}): FindingOut[] {
  const { rules, pnl, pnlPrior, reportUrl, accountOwners = [] } = args;

  const findings: FindingOut[] = [];

  const pnlRows: QboRow[] = pnl?.Rows?.Row || [];
  const flat = flattenRows(pnlRows);

  const enabled = (rules || []).filter((r) => r && r.enabled);

  for (const rule of enabled) {
    const ruleId = rule.id;
    const ruleName = rule.name;
    const severity = rule.severity || "low";

    // ------------------------------------------------------------
    // 1) Built-in: Uncategorized threshold
    // ------------------------------------------------------------
    if (ruleId === "uncategorized_expenses_max") {
      const maxAmount = safeNum(rule.params?.maxAmount, 0);

      const matches = flat.filter(({ path, label }) => {
        const joined = norm(path.join(" / "));
        const lbl = norm(label);
        return joined.includes("uncategorized") || lbl.includes("uncategorized");
      });

      const amounts = matches
        .map(({ row, path }) => ({ path, amount: rowAmount(row) }))
        .filter((x) => typeof x.amount === "number") as { path: string[]; amount: number }[];

      const total = amounts.reduce((acc, x) => acc + Math.abs(x.amount), 0);

      if (total > maxAmount) {
        const evidence = {
          total,
          threshold: maxAmount,
          lines: amounts.slice(0, 50).map((x) => ({ path: x.path, amount: x.amount })),
        };

        findings.push({
          id: makeFindingId(ruleId, evidence),
          title: ruleName,
          severity,
          summary: `Uncategorized total ${total.toFixed(2)} exceeds threshold ${maxAmount}.`,
          detail:
            `We found uncategorized activity totaling ${total.toFixed(2)} for this period, which is above the configured threshold (${maxAmount}).\n\n` +
            `Recommended action:\n` +
            `• Open the uncategorized line(s)\n` +
            `• Assign accounts/classes/vendors where applicable\n` +
            `• Re-run month-end`,
          ruleId,
          ruleName,
          paramsUsed: { maxAmount },
          evidence,
          qbo_link: reportUrl,
        });
      }
      continue;
    }

    // ------------------------------------------------------------
    // 2) Built-in: Negative income lines
    // ------------------------------------------------------------
    if (ruleId === "negative_income_lines") {
      const TOTAL_LABELS = new Set([
        "net income",
        "net operating income",
        "gross profit",
        "gross margin",
        "total income",
        "total revenue",
        "total sales",
        "total expenses",
        "total cost of goods sold",
        "total cogs",
      ]);

      function isTotalishLabel(lbl: string) {
        const x = norm(lbl);
        if (!x) return true;
        if (TOTAL_LABELS.has(x)) return true;
        if (x.startsWith("total ")) return true;
        if (x.startsWith("total")) return true;
        if (x.replace(/\s+/g, "").startsWith("netincome")) return true;
        if (x.replace(/\s+/g, "").startsWith("netoperatingincome")) return true;
        return false;
      }

      function isIncomeContext(path: string[]) {
        const joined = norm(path.join(" / "));
        const looksIncome =
          joined.includes("income") || joined.includes("revenue") || joined.includes("sales");
        if (!looksIncome) return false;

        if (joined.includes("net income")) return false;
        if (joined.includes("net operating income")) return false;

        return true;
      }

      const incomeCandidates = flat.filter(({ path, row }) => {
        const amt = rowAmount(row);
        if (typeof amt !== "number" || !(amt < 0)) return false;

        const lastLabel = path[path.length - 1] ?? "";

        if (isTotalishLabel(lastLabel)) return false;

        const t = norm(row.type);
        if (t.includes("summary") || t.includes("section")) return false;
        if (row.Summary) return false;

        return isIncomeContext(path);
      });

      if (incomeCandidates.length) {
        const evidence = {
          count: incomeCandidates.length,
          lines: incomeCandidates.slice(0, 50).map(({ path, row }) => ({
            path,
            amount: rowAmount(row),
          })),
        };

        // Resolve owner: try to match from first matched line
        const firstIncomeMatch = incomeCandidates[0];
        const accountForMatchingIncome: AccountForMatching | null = firstIncomeMatch
          ? {
              account_name: firstIncomeMatch.path.join(" / "),
              account_type: "pnl",
            }
          : null;
        const ownerIncome = resolveFindingOwner(rule, accountForMatchingIncome, accountOwners);

        findings.push({
          id: makeFindingId(ruleId, evidence),
          title: ruleName,
          severity,
          summary: `Found ${incomeCandidates.length} income line(s) with negative amounts.`,
          detail:
            `Negative amounts inside income/revenue lines can indicate refunds/returns, mis-postings, or sign conventions.\n\n` +
            `Recommended action:\n` +
            `• Confirm whether these are legitimate credits/refunds\n` +
            `• Verify mapping/account selection\n` +
            `• Validate sign conventions in QBO`,
          ruleId,
          ruleName,
          paramsUsed: {},
          evidence,
          qbo_link: reportUrl,
          ...ownerIncome,
        });
      }

      continue;
    }

    // ------------------------------------------------------------
    // 3) Generic: custom_threshold
    //
    // Supports params:
    //  - threshold (number) [required]
    //  - keyword (string)   [optional; defaults to rule.name]
    //  - mode: "sum" | "any" [optional; default "sum"]
    //
    // Behavior:
    //  - sum: sum absolute amounts of matched lines and compare to threshold
    //  - any: trigger if ANY matched line abs(amount) >= threshold
    // ------------------------------------------------------------
    if (rule.type === "custom_threshold" || ruleId.startsWith("custom_")) {
      const threshold = safeNum(rule.params?.threshold, NaN);
      const keywordRaw = String(rule.params?.keyword ?? rule.params?.contains ?? ruleName ?? "").trim();
      const keyword = norm(keywordRaw);
      const mode = String(rule.params?.mode ?? "sum").toLowerCase();

      // Skip incomplete rules gracefully
      if (!Number.isFinite(threshold) || threshold <= 0 || !keyword) continue;

      // Match against BOTH path AND the row label, to catch cases where the keyword
      // appears in the account label but not in the higher-level path.
      const matches = flat.filter(({ path, label }) => {
        const joined = norm(path.join(" / "));
        const lbl = norm(label);
        return joined.includes(keyword) || lbl.includes(keyword);
      });

      const lines = matches
        .map(({ row, path, label }) => ({
          path,
          label,
          amount: rowAmount(row),
        }))
        .filter((x) => typeof x.amount === "number") as { path: string[]; label: string; amount: number }[];

      if (!lines.length) continue;

      const absAmounts = lines.map((l) => Math.abs(l.amount));
      const sumAbs = absAmounts.reduce((a, b) => a + b, 0);
      const maxAbs = Math.max(...absAmounts);

      const triggered = mode === "any" ? maxAbs >= threshold : sumAbs >= threshold;

      if (triggered) {
        const evidence = {
          keyword: keywordRaw,
          mode,
          threshold,
          matchedCount: lines.length,
          sumAbs,
          maxAbs,
          lines: lines.slice(0, 50).map((l) => ({ path: l.path, label: l.label, amount: l.amount })),
        };

        // Resolve owner: try to match from first matched line
        const firstMatch = lines[0];
        const accountForMatching: AccountForMatching | null = firstMatch
          ? {
              account_name: firstMatch.label || firstMatch.path.join(" / "),
              account_type: "pnl",
            }
          : null;
        const owner = resolveFindingOwner(rule, accountForMatching, accountOwners);

        findings.push({
          id: makeFindingId(ruleId, evidence),
          title: ruleName,
          severity,
          summary:
            mode === "any"
              ? `At least one "${keywordRaw}" line is ≥ ${threshold} (max ${maxAbs.toFixed(2)}).`
              : `"${keywordRaw}" total ${sumAbs.toFixed(2)} exceeds threshold ${threshold}.`,
          detail:
            `Rule matched ${lines.length} P&L line(s) containing "${keywordRaw}".\n\n` +
            (mode === "any"
              ? `Triggered because max(abs(amount)) = ${maxAbs.toFixed(2)} ≥ ${threshold}.\n`
              : `Triggered because sum(abs(amount)) = ${sumAbs.toFixed(2)} ≥ ${threshold}.\n`) +
            `\nRecommended action:\n` +
            `• Review the matched line(s) in the P&L\n` +
            `• Confirm classification and supporting detail\n` +
            `• Adjust the threshold if this is expected`,
          ruleId,
          ruleName,
          paramsUsed: { threshold, keyword: keywordRaw, mode },
          evidence,
          qbo_link: reportUrl,
          ...owner,
        });
      }

      continue;
    }

    // ------------------------------------------------------------
    // 4) Variance vs Prior Month
    //
    // Rule type: variance_prior_month
    //
    // Supports params:
    //  - metric (string; e.g. "pnl", "tb", "bs") [default: "pnl"]
    //  - account_selector (object with account_number or account_name_contains)
    //  - abs_threshold (number, optional; e.g. 1000)
    //  - pct_threshold (number, optional; e.g. 0.10 for 10%)
    //  - min_base_amount (number, optional; e.g. 500)
    //  - direction (enum: "any" | "increase" | "decrease"; default "any")
    //
    // Triggers if:
    //  - abs(current - prior) >= abs_threshold (if abs_threshold is set)
    //  OR
    //  - abs(current - prior) / abs(prior) >= pct_threshold (if pct_threshold is set AND abs(prior) >= min_base_amount)
    // ------------------------------------------------------------
    if (rule.type === "variance_prior_month") {
      console.log(`[variance_debug] Evaluating variance rule: ${ruleId} (${ruleName})`);
      
      // Skip if prior month data not available
      if (!pnlPrior) {
        console.warn(`[variance_debug] Rule ${ruleId} (variance_prior_month) skipped: prior month data not available`);
        continue;
      }

      const metric = String(rule.params?.metric || "pnl").toLowerCase();
      if (metric !== "pnl") {
        console.warn(`[variance_debug] Rule ${ruleId}: variance_prior_month only supports "pnl" metric currently`);
        continue;
      }

      const absThreshold = safeNum(rule.params?.abs_threshold, NaN);
      const pctThreshold = safeNum(rule.params?.pct_threshold, NaN);
      const minBaseAmount = safeNum(rule.params?.min_base_amount, 0);
      const direction = String(rule.params?.direction || "any").toLowerCase();

      // Account selector
      const accountSelector = rule.params?.account_selector || {};
      const accountNumber = accountSelector.account_number
        ? String(accountSelector.account_number).trim()
        : null;
      const accountNameContains = accountSelector.account_name_contains
        ? norm(String(accountSelector.account_name_contains))
        : null;

      console.log(`[variance_debug] Rule ${ruleId} config:`, {
        accountNumber,
        accountNameContains,
        absThreshold: Number.isFinite(absThreshold) ? absThreshold : null,
        pctThreshold: Number.isFinite(pctThreshold) ? pctThreshold : null,
        minBaseAmount,
        direction,
      });

      // Skip if no thresholds configured
      if (!Number.isFinite(absThreshold) && !Number.isFinite(pctThreshold)) {
        console.log(`[variance_debug] Rule ${ruleId} skipped: no thresholds configured`);
        continue;
      }

      // Flatten both current and prior month data
      const pnlRowsPrior: QboRow[] = pnlPrior?.Rows?.Row || [];
      const flatPrior = flattenRows(pnlRowsPrior);

      console.log(`[variance_debug] Rule ${ruleId} data counts:`, {
        currentFlatCount: flat.length,
        priorFlatCount: flatPrior.length,
      });

      // Match accounts based on selector
      const currentMatches = flat.filter(({ path, label, row }) => {
        if (accountNumber) {
          // Match by account number (if available in row data)
          const rowId = row.ColData?.[0]?.id || "";
          if (rowId && rowId.includes(accountNumber)) return true;
        }
        if (accountNameContains) {
          const joined = norm(path.join(" / "));
          const lbl = norm(label);
          if (joined.includes(accountNameContains) || lbl.includes(accountNameContains)) return true;
        }
        // If no selector, match all (not recommended but allowed)
        if (!accountNumber && !accountNameContains) return true;
        return false;
      });

      const priorMatches = flatPrior.filter(({ path, label, row }) => {
        if (accountNumber) {
          const rowId = row.ColData?.[0]?.id || "";
          if (rowId && rowId.includes(accountNumber)) return true;
        }
        if (accountNameContains) {
          const joined = norm(path.join(" / "));
          const lbl = norm(label);
          if (joined.includes(accountNameContains) || lbl.includes(accountNameContains)) return true;
        }
        if (!accountNumber && !accountNameContains) return true;
        return false;
      });

      console.log(`[variance_debug] Rule ${ruleId} matched account details:`, {
        currentMatches: currentMatches.slice(0, 5).map(({ path, label, row }) => ({
          path: path.join(" / "),
          label,
          amount: rowAmount(row),
        })),
        priorMatches: priorMatches.slice(0, 5).map(({ path, label, row }) => ({
          path: path.join(" / "),
          label,
          amount: rowAmount(row),
        })),
      });

      // Calculate totals for matched accounts
      const currentTotal = currentMatches
        .map(({ row }) => rowAmount(row))
        .filter((amt): amt is number => typeof amt === "number")
        .reduce((sum, amt) => sum + amt, 0);

      const priorTotal = priorMatches
        .map(({ row }) => rowAmount(row))
        .filter((amt): amt is number => typeof amt === "number")
        .reduce((sum, amt) => sum + amt, 0);

      const delta = currentTotal - priorTotal;
      const absDelta = Math.abs(delta);
      const absPrior = Math.abs(priorTotal);

      // Calculate percentage delta (only if prior != 0)
      let pctDelta: number | null = null;
      if (absPrior > 0) {
        pctDelta = absDelta / absPrior;
      }

      console.log(`[variance_debug] Rule ${ruleId} matched accounts:`, {
        currentMatchesCount: currentMatches.length,
        priorMatchesCount: priorMatches.length,
        currentTotal,
        priorTotal,
        delta,
        absDelta,
        absPrior,
        pctDelta: pctDelta !== null ? pctDelta : null,
      });

      // Check direction filter
      let directionMatch = true;
      if (direction === "increase" && delta <= 0) directionMatch = false;
      if (direction === "decrease" && delta >= 0) directionMatch = false;

      console.log(`[variance_debug] Rule ${ruleId} direction check:`, {
        direction,
        delta,
        directionMatch,
      });

      if (!directionMatch) {
        console.log(`[variance_debug] Rule ${ruleId} skipped: direction filter failed`);
        continue;
      }

      // Check thresholds
      let triggered = false;
      let thresholdReason = "";

      const absTestPassed = Number.isFinite(absThreshold) && absDelta >= absThreshold;
      const pctTestPassed =
        Number.isFinite(pctThreshold) &&
        pctDelta !== null &&
        absPrior >= minBaseAmount &&
        pctDelta >= pctThreshold;

      console.log(`[variance_debug] Rule ${ruleId} threshold tests:`, {
        absThreshold: Number.isFinite(absThreshold) ? absThreshold : null,
        absDelta,
        absTestPassed,
        pctThreshold: Number.isFinite(pctThreshold) ? pctThreshold : null,
        pctDelta: pctDelta !== null ? pctDelta : null,
        absPrior,
        minBaseAmount,
        pctTestPassed,
        absPriorMeetsMinBase: absPrior >= minBaseAmount,
      });

      if (absTestPassed) {
        triggered = true;
        thresholdReason = `Absolute threshold: ${absDelta.toFixed(2)} >= ${absThreshold}`;
      }

      if (pctTestPassed) {
        triggered = true;
        if (thresholdReason) thresholdReason += " OR ";
        thresholdReason += `Percent threshold: ${(pctDelta! * 100).toFixed(1)}% >= ${(pctThreshold * 100).toFixed(1)}%`;
      }

      // Special case: prior = 0, only check absolute threshold
      if (absPrior === 0 && Number.isFinite(absThreshold) && absDelta >= absThreshold) {
        triggered = true;
        thresholdReason = `Absolute threshold (prior=0): ${absDelta.toFixed(2)} >= ${absThreshold}`;
      }

      console.log(`[variance_debug] Rule ${ruleId} final result:`, {
        triggered,
        thresholdReason: triggered ? thresholdReason : "No thresholds breached",
      });

      if (triggered) {
        // Build matched lines with current/prior/delta for evidence
        const matchedLines: Array<{
          account_name: string;
          account_path: string[];
          current: number;
          prior: number;
          delta: number;
        }> = [];

        // Group matches by account name/path to show per-account totals
        const accountMap = new Map<string, { current: number; prior: number; path: string[] }>();

        currentMatches.forEach(({ path, label, row }) => {
          const accountKey = path.join(" / ") || label;
          const amount = rowAmount(row) || 0;
          const existing = accountMap.get(accountKey) || { current: 0, prior: 0, path };
          accountMap.set(accountKey, { ...existing, current: existing.current + amount });
        });

        priorMatches.forEach(({ path, label, row }) => {
          const accountKey = path.join(" / ") || label;
          const amount = rowAmount(row) || 0;
          const existing = accountMap.get(accountKey) || { current: 0, prior: 0, path };
          accountMap.set(accountKey, { ...existing, prior: existing.prior + amount });
        });

        // Convert to matched lines array
        for (const [accountName, { current, prior, path }] of accountMap.entries()) {
          matchedLines.push({
            account_name: accountName,
            account_path: path,
            current,
            prior,
            delta: current - prior,
          });
        }

        // Sort by absolute delta descending, take top 10
        matchedLines.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const topMatchedLines = matchedLines.slice(0, 10);

        const evidence = {
          current_value: currentTotal,
          prior_value: priorTotal,
          delta,
          abs_delta: absDelta,
          pct_delta: pctDelta !== null ? pctDelta : null,
          abs_threshold: Number.isFinite(absThreshold) ? absThreshold : null,
          pct_threshold: Number.isFinite(pctThreshold) ? pctThreshold : null,
          min_base_amount: minBaseAmount,
          direction,
          account_selector: accountSelector,
          threshold_reason: thresholdReason,
          matched_accounts_current: currentMatches.slice(0, 10).map(({ path, label }) => ({
            path,
            label,
          })),
          matched_accounts_prior: priorMatches.slice(0, 10).map(({ path, label }) => ({
            path,
            label,
          })),
          matched_lines: topMatchedLines,
        };

        // Resolve owner: use account selector from rule
        const accountForMatchingVariance: AccountForMatching | null = accountNameContains
          ? {
              account_name: accountNameContains,
              account_type: "pnl",
            }
          : accountNumber
          ? {
              account_number: accountNumber,
              account_type: "pnl",
            }
          : null;
        const ownerVariance = resolveFindingOwner(rule, accountForMatchingVariance, accountOwners);

        const finding: FindingOut = {
          id: makeFindingId(ruleId, evidence),
          title: ruleName,
          severity,
          summary: `Variance detected: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${pctDelta !== null ? (pctDelta * 100).toFixed(1) : "N/A"}%) vs prior month. ${thresholdReason}`,
          detail:
            `Current month value: ${currentTotal.toFixed(2)}\n` +
            `Prior month value: ${priorTotal.toFixed(2)}\n` +
            `Delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}\n` +
            (pctDelta !== null ? `Percent change: ${(pctDelta * 100).toFixed(1)}%\n` : "") +
            `\nThresholds:\n` +
            (Number.isFinite(absThreshold) ? `  Absolute: ${absThreshold}\n` : "") +
            (Number.isFinite(pctThreshold) ? `  Percent: ${(pctThreshold * 100).toFixed(1)}%\n` : "") +
            (minBaseAmount > 0 ? `  Min base amount: ${minBaseAmount}\n` : "") +
            `  Direction: ${direction}\n` +
            `\n${thresholdReason}\n` +
            `\nRecommended action:\n` +
            `• Review the account(s) in both periods\n` +
            `• Verify transactions and classifications\n` +
            `• Confirm if variance is expected or requires investigation`,
          ruleId,
          ruleName,
          paramsUsed: rule.params,
          evidence,
          qbo_link: reportUrl,
          current_value: currentTotal,
          prior_value: priorTotal,
          delta,
          pct_delta: pctDelta !== null ? pctDelta : null,
          ...ownerVariance,
        };

        findings.push(finding);
      }

      continue;
    }

    // ------------------------------------------------------------
    // Future: large_expense_variance_pct (needs prior period dataset)
    // ------------------------------------------------------------
  }

  return findings;
}
