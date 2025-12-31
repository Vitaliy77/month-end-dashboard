// api/src/accruals/detection.ts
import { qboFetchForOrg } from "../lib/qboFetchForOrg.js";
import crypto from "crypto";
import type { AccrualRule } from "./rulesStore.js";

export type AccrualCandidate = {
  id: string;
  orgId: string;
  periodFromDate: string;
  periodToDate: string;
  vendorName: string | null;
  accountId: string;
  accountName: string;
  expectedAmount: number;
  confidenceScore: number;
  explanation: {
    reason: string;
    historicalMonths: number;
    averageAmount: number;
    lastSeenDate: string | null;
    pattern: string;
  };
  status: "pending" | "approved" | "rejected";
};

export type DetectionDebug = {
  history_window_from: string;
  history_window_to: string;
  rows_read_count: number;
  groups_found_count: number;
  excluded_by_min_amount: number;
  excluded_by_confidence: number;
  excluded_by_missing_recurrence: number;
  excluded_because_present_in_current_period: number;
  excluded_by_account_filter: number;
  excluded_by_vendor_filter: number;
  top_candidate_examples_pre_threshold: Array<{
    accountId: string;
    accountName: string;
    vendorName: string | null;
    averageAmount: number;
    confidence: number;
    reason: string;
  }>;
  timings_ms: {
    fetch_historical: number;
    fetch_current: number;
    processing: number;
    total: number;
  };
};

export type DetectionResult = {
  candidates: AccrualCandidate[];
  debug?: DetectionDebug;
};

/**
 * Detect accrual candidates by analyzing recurring expenses from last N months
 * that are missing in the current period.
 */
export async function detectAccrualCandidates(
  orgId: string,
  periodFrom: string,
  periodTo: string,
  rules: AccrualRule,
  debug: boolean = false
): Promise<DetectionResult> {
  const startTime = Date.now();
  const candidates: AccrualCandidate[] = [];
  const debugInfo: DetectionDebug = {
    history_window_from: "",
    history_window_to: "",
    rows_read_count: 0,
    groups_found_count: 0,
    excluded_by_min_amount: 0,
    excluded_by_confidence: 0,
    excluded_by_missing_recurrence: 0,
    excluded_because_present_in_current_period: 0,
    excluded_by_account_filter: 0,
    excluded_by_vendor_filter: 0,
    top_candidate_examples_pre_threshold: [],
    timings_ms: {
      fetch_historical: 0,
      fetch_current: 0,
      processing: 0,
      total: 0,
    },
  };

  // Calculate date range for historical analysis (using rules.lookback_months)
  const periodStart = new Date(periodFrom + "T00:00:00Z");
  const historicalStart = new Date(periodStart);
  historicalStart.setMonth(historicalStart.getMonth() - rules.lookback_months);

  const historicalFrom = historicalStart.toISOString().slice(0, 10);
  const historicalTo = new Date(periodStart.getTime() - 86400000).toISOString().slice(0, 10); // day before period

  debugInfo.history_window_from = historicalFrom;
  debugInfo.history_window_to = historicalTo;

  console.log(`[accruals] Analyzing historical period: ${historicalFrom} to ${historicalTo} (${rules.lookback_months} months)`);
  console.log(`[accruals] Current period: ${periodFrom} to ${periodTo}`);
  console.log(`[accruals] Rules: min_amount=${rules.min_amount}, confidence_threshold=${rules.confidence_threshold}, min_recurrence=${rules.min_recurrence_count}`);

  try {
    const fetchHistoricalStart = Date.now();
    // Fetch P&L for historical period
    const historicalPnl = await qboFetchForOrg(orgId, "/reports/ProfitAndLoss", {
      start_date: historicalFrom,
      end_date: historicalTo,
    });
    debugInfo.timings_ms.fetch_historical = Date.now() - fetchHistoricalStart;

    const fetchCurrentStart = Date.now();
    // Fetch P&L for current period
    const currentPnl = await qboFetchForOrg(orgId, "/reports/ProfitAndLoss", {
      start_date: periodFrom,
      end_date: periodTo,
    });
    debugInfo.timings_ms.fetch_current = Date.now() - fetchCurrentStart;

    const processingStart = Date.now();
    // Extract expense accounts from historical P&L
    const historicalExpenses = extractExpenseAccounts(historicalPnl);
    const currentExpenses = extractExpenseAccounts(currentPnl);

    debugInfo.rows_read_count = historicalExpenses.length + currentExpenses.length;
    debugInfo.groups_found_count = historicalExpenses.length;

    // Build map of current period expenses by account ID
    const currentExpenseMap = new Map<string, number>();
    for (const exp of currentExpenses) {
      currentExpenseMap.set(exp.accountId, exp.amount);
    }

    // Pre-compute exclusion sets for faster lookups
    const excludedAccounts = new Set(rules.excluded_accounts || []);
    const excludedVendors = new Set(rules.excluded_vendors || []);
    const includeAccounts = rules.include_accounts && rules.include_accounts.length > 0 
      ? new Set(rules.include_accounts) 
      : null;

    // Track candidates before threshold filtering (for debug)
    const preThresholdCandidates: Array<{
      accountId: string;
      accountName: string;
      vendorName: string | null;
      averageAmount: number;
      confidence: number;
      reason: string;
    }> = [];

    // Analyze each historical expense
    for (const histExp of historicalExpenses) {
      // Check account inclusion/exclusion filters
      if (includeAccounts && !includeAccounts.has(histExp.accountId)) {
        debugInfo.excluded_by_account_filter++;
        continue;
      }
      if (excludedAccounts.has(histExp.accountId)) {
        debugInfo.excluded_by_account_filter++;
        continue;
      }
      if (histExp.vendorName && excludedVendors.has(histExp.vendorName)) {
        debugInfo.excluded_by_vendor_filter++;
        continue;
      }

      const currentAmount = currentExpenseMap.get(histExp.accountId) || 0;
      const historicalAvg = histExp.averageAmount;

      // Skip if expense exists in current period (within 10% variance)
      if (Math.abs(currentAmount - historicalAvg) / Math.max(Math.abs(historicalAvg), 1) < 0.1) {
        debugInfo.excluded_because_present_in_current_period++;
        continue;
      }

      // Skip if historical average is too small (using rules.min_amount)
      if (Math.abs(historicalAvg) < rules.min_amount) {
        debugInfo.excluded_by_min_amount++;
        continue;
      }

      // Check minimum recurrence count
      if (histExp.monthCount < rules.min_recurrence_count) {
        debugInfo.excluded_by_missing_recurrence++;
        continue;
      }

      // Calculate confidence based on consistency
      const confidence = calculateConfidence(histExp);

      // Track for debug (before threshold filter)
      if (debug && preThresholdCandidates.length < 5) {
        preThresholdCandidates.push({
          accountId: histExp.accountId,
          accountName: histExp.accountName,
          vendorName: histExp.vendorName,
          averageAmount: historicalAvg,
          confidence,
          reason: `Recurring expense missing in current period. Average: ${formatMoney(historicalAvg)} over ${histExp.monthCount} months.`,
        });
      }

      // Only include high-confidence candidates (using rules.confidence_threshold)
      if (confidence >= rules.confidence_threshold) {
        candidates.push({
          id: crypto.randomUUID(),
          orgId,
          periodFromDate: periodFrom,
          periodToDate: periodTo,
          vendorName: histExp.vendorName,
          accountId: histExp.accountId,
          accountName: histExp.accountName,
          expectedAmount: Math.abs(historicalAvg),
          confidenceScore: confidence,
          explanation: {
            reason: `Recurring expense missing in current period. Average: ${formatMoney(historicalAvg)} over ${histExp.monthCount} months.`,
            historicalMonths: histExp.monthCount,
            averageAmount: historicalAvg,
            lastSeenDate: histExp.lastSeenDate,
            pattern: histExp.pattern,
          },
          status: "pending",
        });
      } else {
        debugInfo.excluded_by_confidence++;
      }
    }

    debugInfo.top_candidate_examples_pre_threshold = preThresholdCandidates;
    debugInfo.timings_ms.processing = Date.now() - processingStart;
    debugInfo.timings_ms.total = Date.now() - startTime;

    console.log(`[accruals] Detected ${candidates.length} accrual candidates`);
    if (debug) {
      console.log(`[accruals] Debug: ${JSON.stringify(debugInfo, null, 2)}`);
    }

    return {
      candidates,
      debug: debug ? debugInfo : undefined,
    };
  } catch (error: any) {
    console.error("[accruals] Detection error:", error);
    throw new Error(`Failed to detect accrual candidates: ${error?.message || String(error)}`);
  }
}

type ExpenseAccount = {
  accountId: string;
  accountName: string;
  vendorName: string | null;
  amount: number;
  averageAmount: number;
  monthCount: number;
  lastSeenDate: string | null;
  pattern: string;
};

function extractExpenseAccounts(pnl: any): ExpenseAccount[] {
  const expenses: ExpenseAccount[] = [];
  const accountMap = new Map<string, ExpenseAccount>();

  function processRow(row: any, path: string[] = []) {
    if (!row) return;

    const cols = row.ColData || [];
    if (!Array.isArray(cols) || cols.length === 0) {
      if (row.Rows?.Row) {
        for (const child of row.Rows.Row) {
          processRow(child, path);
        }
      }
      return;
    }

    const accountName = cols[0]?.value || "";
    const accountId = cols[0]?.id;
    const amount = parseAmount(cols[cols.length - 1]?.value);

    // Only process expense accounts (negative amounts in P&L)
    if (accountId && amount < 0 && Math.abs(amount) > 10) {
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountName: path.length > 0 ? path.join(" / ") + " / " + accountName : accountName,
          vendorName: extractVendorName(accountName),
          amount: 0,
          averageAmount: 0,
          monthCount: 0,
          lastSeenDate: null,
          pattern: "monthly",
        });
      }
      const acc = accountMap.get(accountId)!;
      acc.amount += Math.abs(amount);
      acc.monthCount += 1;
    }

    // Process children
    if (row.Rows?.Row && Array.isArray(row.Rows.Row)) {
      const nextPath = accountName && accountName.trim() ? [...path, accountName] : path;
      for (const child of row.Rows.Row) {
        processRow(child, nextPath);
      }
    }
  }

  if (pnl?.Rows?.Row && Array.isArray(pnl.Rows.Row)) {
    for (const row of pnl.Rows.Row) {
      processRow(row);
    }
  }

  // Calculate averages
  for (const acc of accountMap.values()) {
    if (acc.monthCount > 0) {
      acc.averageAmount = acc.amount / acc.monthCount;
    }
    expenses.push(acc);
  }

  return expenses;
}

function parseAmount(value: any): number {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  // Handle QBO format: "(123.45)" for negatives, "$", commas
  const negByParens = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negByParens ? -n : n;
}

function extractVendorName(accountName: string): string | null {
  // Simple heuristic: if account name contains common vendor patterns
  const vendorPatterns = [
    /^(.+?)\s+(Services|Inc|LLC|Corp|Ltd|Company)/i,
    /^(.+?)\s+-\s+/,
  ];
  for (const pattern of vendorPatterns) {
    const match = accountName.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function calculateConfidence(expense: ExpenseAccount): number {
  let confidence = 0.5; // base confidence

  // Higher confidence for more months of history
  if (expense.monthCount >= 6) confidence += 0.2;
  else if (expense.monthCount >= 3) confidence += 0.1;

  // Higher confidence for consistent amounts (lower variance)
  // This is simplified - in production, calculate actual variance
  if (expense.averageAmount > 1000) confidence += 0.1; // larger amounts more likely to be recurring

  // Higher confidence if vendor name is extractable
  if (expense.vendorName) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

